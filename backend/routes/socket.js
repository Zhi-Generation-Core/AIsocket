const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { assertCaseAccess, nextVersionNumber, mapVersionRow } = require('../utils/caseHelpers');
const { callGeminiRefine } = require('../utils/geminiRefine');
const { caseDir, safeFileName, relativePath } = require('../utils/fileStorage');

const router = express.Router();
router.use(authenticate);

const ALLOWED_STATUS = new Set([
  'ai_initial',
  'fitting_adjustment',
  'follow_up',
  'manufacturing_confirmed',
]);

async function createVersionRecord({
  caseId,
  scanId,
  userId,
  label,
  source,
  status,
  parameters,
  patientContext,
  geometrySummary,
  riskZones,
  refinement,
  semanticActions,
  volumeConservation,
  versionDelta,
  notes,
}) {
  const versionNumber = await nextVersionNumber(caseId);
  const versionId = uuidv4();

  await query(
    `INSERT INTO socket_versions (
       id, case_id, scan_id, created_by, version_number, label, source, status,
       parameters, patient_context, geometry_summary, risk_zones, refinement,
       semantic_actions, volume_conservation, version_delta, notes
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
       $14::jsonb, $15::jsonb, $16::jsonb, $17
     )`,
    [
      versionId,
      caseId,
      scanId || null,
      userId,
      versionNumber,
      label || `V${versionNumber}`,
      source || 'algorithm',
      status || 'ai_initial',
      JSON.stringify(parameters || {}),
      JSON.stringify(patientContext || {}),
      JSON.stringify(geometrySummary || {}),
      JSON.stringify(riskZones || []),
      refinement ? JSON.stringify(refinement) : null,
      JSON.stringify(semanticActions || []),
      volumeConservation ? JSON.stringify(volumeConservation) : null,
      versionDelta ? JSON.stringify(versionDelta) : null,
      notes || null,
    ]
  );

  const result = await query('SELECT * FROM socket_versions WHERE id = $1', [versionId]);
  return mapVersionRow(result.rows[0]);
}

router.post('/generate', async (req, res, next) => {
  try {
    const {
      caseId,
      scanId,
      label,
      source = 'algorithm',
      status = 'ai_initial',
      parameters,
      patientContext,
      geometrySummary,
      riskZones,
      semanticActions,
      volumeConservation,
      versionDelta,
      notes,
    } = req.body || {};

    if (!caseId) {
      return res.status(400).json({ error: 'caseId 为必填' });
    }
    if (status && !ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: '无效的版本状态' });
    }

    await assertCaseAccess(caseId, req.user.org_id);

    const version = await createVersionRecord({
      caseId,
      scanId,
      userId: req.user.id,
      label: label || '算法生成',
      source,
      status,
      parameters,
      patientContext,
      geometrySummary,
      riskZones,
      semanticActions,
      volumeConservation,
      versionDelta,
      notes,
    });

    res.status(201).json({ version });
  } catch (error) {
    next(error);
  }
});

router.post('/refine', async (req, res, next) => {
  const {
    caseId,
    scanId,
    baseVersionId,
    payload,
    label = 'AI复核',
    status = 'fitting_adjustment',
    parameters,
    patientContext,
    geometrySummary,
    riskZones,
    semanticActions,
    volumeConservation,
    versionDelta,
  } = req.body || {};

  let refineLogId = null;

  try {
    if (!caseId) {
      return res.status(400).json({ error: 'caseId 为必填' });
    }

    await assertCaseAccess(caseId, req.user.org_id);
    refineLogId = uuidv4();

    let geminiResult = null;
    let modelName = null;
    let success = false;
    let errorMessage = null;

    try {
      const response = await callGeminiRefine(payload || req.body);
      geminiResult = response.result;
      modelName = response.model;
      success = true;
    } catch (error) {
      errorMessage = error.message;
    }

    await query(
      `INSERT INTO refine_logs (id, case_id, version_id, model_name, input_summary, result, success, error_message)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        refineLogId,
        caseId,
        baseVersionId || null,
        modelName,
        JSON.stringify(payload?.summary || geometrySummary || {}),
        geminiResult ? JSON.stringify(geminiResult) : null,
        success,
        errorMessage,
      ]
    );

    if (!success) {
      return res.status(502).json({
        ok: false,
        error: errorMessage,
        refineLogId,
      });
    }

    const version = await createVersionRecord({
      caseId,
      scanId,
      userId: req.user.id,
      label,
      source: 'gemini_refine',
      status,
      parameters: parameters || {},
      patientContext: patientContext || {},
      geometrySummary: geometrySummary || {},
      riskZones: geminiResult?.riskZones || riskZones || [],
      refinement: geminiResult,
      semanticActions,
      volumeConservation,
      versionDelta,
    });

    await query('UPDATE refine_logs SET version_id = $1 WHERE id = $2', [version.id, refineLogId]);

    res.json({
      ok: true,
      model: modelName,
      result: geminiResult,
      version,
      refineLogId,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/export', async (req, res, next) => {
  try {
    const { caseId, versionId, fileName, stlContent, report } = req.body || {};
    if (!caseId || !versionId) {
      return res.status(400).json({ error: 'caseId 与 versionId 为必填' });
    }

    await assertCaseAccess(caseId, req.user.org_id);

    const versionCheck = await query(
      'SELECT id FROM socket_versions WHERE id = $1 AND case_id = $2',
      [versionId, caseId]
    );
    if (versionCheck.rows.length === 0) {
      return res.status(404).json({ error: '版本不存在' });
    }

    let storedPath = null;
    let storedName = fileName || 'socket_export.stl';

    if (stlContent) {
      const dir = caseDir(caseId, 'exports');
      storedName = safeFileName(storedName);
      const abs = path.join(dir, `${Date.now()}-${storedName}`);
      fs.writeFileSync(abs, stlContent, 'utf8');
      storedPath = relativePath(abs);
    }

    const exportId = uuidv4();
    await query(
      `INSERT INTO export_records (id, case_id, version_id, exported_by, file_name, file_path, report)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        exportId,
        caseId,
        versionId,
        req.user.id,
        storedName,
        storedPath,
        JSON.stringify(report || {}),
      ]
    );

    res.status(201).json({
      exportId,
      fileName: storedName,
      filePath: storedPath,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
