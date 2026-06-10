const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { assertCaseAccess } = require('../utils/caseHelpers');
const { caseDir, safeFileName, relativePath } = require('../utils/fileStorage');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const caseId = req.body?.caseId || req.query?.caseId;
      if (!caseId) {
        cb(new Error('caseId 为必填'));
        return;
      }
      cb(null, caseDir(caseId, 'scans'));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${safeFileName(file.originalname || 'scan')}${ext ? '' : '.stl'}`);
    },
  }),
  limits: { fileSize: 80 * 1024 * 1024 },
});

function detectFormat(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (ext === '.stl') return 'stl';
  if (ext === '.obj') return 'obj';
  return 'other';
}

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { caseId, metrics } = req.body || {};
    if (!caseId) {
      return res.status(400).json({ error: 'caseId 为必填' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '请上传扫描文件' });
    }

    await assertCaseAccess(caseId, req.user.org_id);

    let metricsJson = {};
    if (metrics) {
      try {
        metricsJson = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
      } catch {
        return res.status(400).json({ error: 'metrics 必须是合法 JSON' });
      }
    }

    const scanId = uuidv4();
    const rel = relativePath(req.file.path);
    const format = detectFormat(req.file.originalname);

    await query(
      `INSERT INTO scan_assets (
         id, case_id, uploaded_by, file_name, file_path, format, file_size_bytes, metrics
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        scanId,
        caseId,
        req.user.id,
        req.file.originalname,
        rel,
        format,
        req.file.size,
        JSON.stringify(metricsJson),
      ]
    );

    res.status(201).json({
      scan: {
        id: scanId,
        caseId,
        fileName: req.file.originalname,
        filePath: rel,
        format,
        fileSizeBytes: req.file.size,
        metrics: metricsJson,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT s.*, c.org_id
       FROM scan_assets s
       JOIN cases c ON c.id = s.case_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '扫描文件不存在' });
    }
    const scan = result.rows[0];
    if (scan.org_id !== req.user.org_id) {
      return res.status(403).json({ error: '无权访问' });
    }

    const { resolveStoredPath } = require('../utils/fileStorage');
    res.download(resolveStoredPath(scan.file_path), scan.file_name);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
