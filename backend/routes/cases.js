const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const {
  assertCaseAccess,
  generateInviteCode,
  mapCaseRow,
  mapVersionRow,
} = require('../utils/caseHelpers');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.*, p.display_name AS patient_name, p.anonymous_code AS patient_anonymous_code
       FROM cases c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.org_id = $1
       ORDER BY c.updated_at DESC`,
      [req.user.org_id]
    );
    res.json({ cases: result.rows.map(mapCaseRow) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      patientName,
      anonymousCode,
      title,
      amputationSite,
      side = 'right',
      activityLevel = 'K3',
      initialModelingDate,
      notes,
    } = req.body || {};

    if (!patientName || !title) {
      return res.status(400).json({ error: 'patientName 与 title 为必填' });
    }

    const patientId = uuidv4();
    const caseId = uuidv4();

    await query(
      `INSERT INTO patients (id, org_id, display_name, anonymous_code)
       VALUES ($1, $2, $3, $4)`,
      [patientId, req.user.org_id, patientName, anonymousCode || null]
    );

    await query(
      `INSERT INTO cases (
         id, org_id, patient_id, created_by, title, amputation_site, side,
         activity_level, initial_modeling_date, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        caseId,
        req.user.org_id,
        patientId,
        req.user.id,
        title,
        amputationSite || null,
        side,
        activityLevel,
        initialModelingDate || null,
        notes || null,
      ]
    );

    const detail = await query(
      `SELECT c.*, p.display_name AS patient_name, p.anonymous_code AS patient_anonymous_code
       FROM cases c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1`,
      [caseId]
    );

    res.status(201).json({ case: mapCaseRow(detail.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/versions', async (req, res, next) => {
  try {
    await assertCaseAccess(req.params.id, req.user.org_id);
    const versions = await query(
      `SELECT * FROM socket_versions WHERE case_id = $1 ORDER BY version_number DESC`,
      [req.params.id]
    );
    res.json({ versions: versions.rows.map(mapVersionRow) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/feedback', async (req, res, next) => {
  try {
    await assertCaseAccess(req.params.id, req.user.org_id);
    const caseId = req.params.id;

    const [pain, usage, feedback, invites] = await Promise.all([
      query(
        `SELECT region_id, severity, pain_type, activity_scene, notes, created_at
         FROM pain_feedback WHERE case_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [caseId]
      ),
      query(
        `SELECT log_date, wear_minutes, comfort_score, activity_scene, notes, created_at
         FROM usage_logs WHERE case_id = $1 ORDER BY log_date DESC, created_at DESC LIMIT 30`,
        [caseId]
      ),
      query(
        `SELECT feedback_type, content, created_at
         FROM mobile_feedback WHERE case_id = $1 ORDER BY created_at DESC LIMIT 30`,
        [caseId]
      ),
      query(
        `SELECT invite_code, patient_label, is_active, expires_at, created_at
         FROM case_invites WHERE case_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [caseId]
      ),
    ]);

    res.json({
      painFeedback: pain.rows,
      usageLogs: usage.rows,
      feedback: feedback.rows,
      invites: invites.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    await assertCaseAccess(req.params.id, req.user.org_id);

    const caseResult = await query(
      `SELECT c.*, p.display_name AS patient_name, p.anonymous_code AS patient_anonymous_code
       FROM cases c
       JOIN patients p ON p.id = c.patient_id
       WHERE c.id = $1`,
      [req.params.id]
    );

    const scans = await query(
      `SELECT id, case_id, file_name, file_path, format, file_size_bytes, metrics, created_at
       FROM scan_assets WHERE case_id = $1 ORDER BY created_at DESC`,
      [req.params.id]
    );

    const versions = await query(
      `SELECT * FROM socket_versions WHERE case_id = $1 ORDER BY version_number DESC`,
      [req.params.id]
    );

    res.json({
      case: mapCaseRow(caseResult.rows[0]),
      scans: scans.rows,
      versions: versions.rows.map(mapVersionRow),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/invites', async (req, res, next) => {
  try {
    await assertCaseAccess(req.params.id, req.user.org_id);
    const inviteId = uuidv4();
    let inviteCode = generateInviteCode();

    for (let i = 0; i < 5; i += 1) {
      const exists = await query('SELECT 1 FROM case_invites WHERE invite_code = $1', [inviteCode]);
      if (exists.rows.length === 0) break;
      inviteCode = generateInviteCode();
    }

    await query(
      `INSERT INTO case_invites (id, case_id, invite_code, patient_label, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        inviteId,
        req.params.id,
        inviteCode,
        req.body?.patientLabel || null,
        req.body?.expiresAt || null,
      ]
    );

    res.status(201).json({ inviteCode, inviteId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
