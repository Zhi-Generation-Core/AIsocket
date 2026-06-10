const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const router = express.Router();

const VALID_SEVERITY = new Set(['mild', 'moderate', 'severe']);
const VALID_PAIN_TYPES = new Set(['pressure', 'friction', 'numbness', 'loose', 'unstable']);
const VALID_SCENES = new Set(['standing', 'walking', 'stairs', 'sitting', 'exercise', 'other']);

async function resolveBinding(req, res, next) {
  try {
    const bindingId = req.headers['x-binding-id'] || req.body?.bindingId;
    if (!bindingId) {
      return res.status(401).json({ error: '缺少移动端绑定 ID' });
    }

    const result = await query(
      `SELECT b.*, c.title AS case_title, c.side, c.activity_level,
              p.display_name AS patient_name
       FROM patient_bindings b
       JOIN cases c ON c.id = b.case_id
       JOIN patients p ON p.id = c.patient_id
       WHERE b.id = $1`,
      [bindingId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '绑定无效，请重新输入邀请码' });
    }

    req.binding = result.rows[0];
    await query('UPDATE patient_bindings SET last_seen_at = NOW() WHERE id = $1', [bindingId]);
    next();
  } catch (error) {
    next(error);
  }
}

function mapCaseInfo(binding, versions = []) {
  return {
    case: {
      id: binding.case_id,
      title: binding.case_title,
      side: binding.side,
      activityLevel: binding.activity_level,
      patientName: binding.patient_name,
    },
    recentVersions: versions,
  };
}

router.post('/bind', async (req, res, next) => {
  try {
    const { inviteCode, deviceLabel } = req.body || {};
    if (!inviteCode) {
      return res.status(400).json({ error: 'inviteCode 为必填' });
    }

    const invite = await query(
      `SELECT ci.*, c.id AS case_id, c.title AS case_title, c.side, c.activity_level,
              p.display_name AS patient_name
       FROM case_invites ci
       JOIN cases c ON c.id = ci.case_id
       JOIN patients p ON p.id = c.patient_id
       WHERE ci.invite_code = $1 AND ci.is_active = true`,
      [String(inviteCode).trim().toUpperCase()]
    );

    if (invite.rows.length === 0) {
      return res.status(404).json({ error: '邀请码无效' });
    }

    const row = invite.rows[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: '邀请码已过期' });
    }

    const bindingId = uuidv4();
    await query(
      `INSERT INTO patient_bindings (id, invite_id, case_id, device_label)
       VALUES ($1, $2, $3, $4)`,
      [bindingId, row.id, row.case_id, deviceLabel || null]
    );

    const versions = await query(
      `SELECT id, version_number, label, status, created_at
       FROM socket_versions WHERE case_id = $1 ORDER BY version_number DESC LIMIT 5`,
      [row.case_id]
    );

    res.status(201).json({
      bindingId,
      caseId: row.case_id,
      ...mapCaseInfo(
        {
          case_id: row.case_id,
          case_title: row.case_title,
          side: row.side,
          activity_level: row.activity_level,
          patient_name: row.patient_name,
        },
        versions.rows
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/session', resolveBinding, async (req, res, next) => {
  try {
    const versions = await query(
      `SELECT id, version_number, label, status, created_at
       FROM socket_versions WHERE case_id = $1 ORDER BY version_number DESC LIMIT 5`,
      [req.binding.case_id]
    );
    res.json(mapCaseInfo(req.binding, versions.rows));
  } catch (error) {
    next(error);
  }
});

router.get('/cases/:id', resolveBinding, async (req, res, next) => {
  try {
    if (req.binding.case_id !== req.params.id) {
      return res.status(403).json({ error: '无权查看该病例' });
    }
    const versions = await query(
      `SELECT id, version_number, label, status, created_at
       FROM socket_versions WHERE case_id = $1 ORDER BY version_number DESC LIMIT 5`,
      [req.params.id]
    );
    res.json(mapCaseInfo(req.binding, versions.rows));
  } catch (error) {
    next(error);
  }
});

router.post('/pain-map', resolveBinding, async (req, res, next) => {
  try {
    const { regionId, severity, painType, activityScene, notes, payload } = req.body || {};
    if (!regionId || !severity) {
      return res.status(400).json({ error: 'regionId 与 severity 为必填' });
    }
    if (!VALID_SEVERITY.has(severity)) {
      return res.status(400).json({ error: 'severity 须为 mild / moderate / severe' });
    }
    if (painType && !VALID_PAIN_TYPES.has(painType)) {
      return res.status(400).json({ error: '无效的 painType' });
    }
    if (activityScene && !VALID_SCENES.has(activityScene)) {
      return res.status(400).json({ error: '无效的 activityScene' });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO pain_feedback (
         id, binding_id, case_id, region_id, severity, pain_type, activity_scene, notes, payload
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        id,
        req.binding.id,
        req.binding.case_id,
        regionId,
        severity,
        painType || null,
        activityScene || null,
        notes || null,
        JSON.stringify(payload || {}),
      ]
    );

    res.status(201).json({ id });
  } catch (error) {
    next(error);
  }
});

router.post('/feedback', resolveBinding, async (req, res, next) => {
  try {
    const {
      feedbackType = 'general',
      content,
      payload,
      wearMinutes,
      comfortScore,
      activityScene,
      logDate,
    } = req.body || {};

    if (feedbackType === 'usage_log') {
      const id = uuidv4();
      await query(
        `INSERT INTO usage_logs (id, binding_id, case_id, log_date, wear_minutes, comfort_score, activity_scene, notes)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7, $8)`,
        [
          id,
          req.binding.id,
          req.binding.case_id,
          logDate || null,
          Number(wearMinutes || 0),
          comfortScore ?? null,
          activityScene || null,
          content || null,
        ]
      );
      return res.status(201).json({ id, type: 'usage_log' });
    }

    if (!content) {
      return res.status(400).json({ error: 'content 为必填' });
    }

    const id = uuidv4();
    await query(
      `INSERT INTO mobile_feedback (id, binding_id, case_id, feedback_type, content, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [id, req.binding.id, req.binding.case_id, feedbackType, content, JSON.stringify(payload || {})]
    );

    res.status(201).json({ id, type: 'feedback' });
  } catch (error) {
    next(error);
  }
});

router.get('/timeline', resolveBinding, async (req, res, next) => {
  try {
    const caseId = req.binding.case_id;

    const [pain, usage, feedback] = await Promise.all([
      query(
        `SELECT id, region_id, severity, pain_type, activity_scene, notes, created_at
         FROM pain_feedback WHERE case_id = $1 AND binding_id = $2
         ORDER BY created_at DESC LIMIT 50`,
        [caseId, req.binding.id]
      ),
      query(
        `SELECT id, log_date, wear_minutes, comfort_score, activity_scene, notes, created_at
         FROM usage_logs WHERE case_id = $1 AND binding_id = $2
         ORDER BY log_date DESC, created_at DESC LIMIT 50`,
        [caseId, req.binding.id]
      ),
      query(
        `SELECT id, feedback_type, content, created_at
         FROM mobile_feedback WHERE case_id = $1 AND binding_id = $2
         ORDER BY created_at DESC LIMIT 50`,
        [caseId, req.binding.id]
      ),
    ]);

    res.json({
      painFeedback: pain.rows,
      usageLogs: usage.rows,
      feedback: feedback.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', resolveBinding, async (req, res, next) => {
  try {
    const caseId = req.binding.case_id;
    const bindingId = req.binding.id;
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));

    const [painStats, usageStats, recentNotes] = await Promise.all([
      query(
        `SELECT region_id, severity, COUNT(*)::int AS count
         FROM pain_feedback
         WHERE case_id = $1 AND binding_id = $2
           AND created_at >= NOW() - ($3 || ' days')::interval
         GROUP BY region_id, severity
         ORDER BY count DESC`,
        [caseId, bindingId, String(days)]
      ),
      query(
        `SELECT COALESCE(AVG(wear_minutes), 0)::int AS avg_wear_minutes,
                COALESCE(AVG(comfort_score), 0)::numeric(4,2) AS avg_comfort,
                COUNT(*)::int AS log_days
         FROM usage_logs
         WHERE case_id = $1 AND binding_id = $2
           AND log_date >= CURRENT_DATE - $3::int`,
        [caseId, bindingId, days]
      ),
      query(
        `SELECT feedback_type, content, created_at
         FROM mobile_feedback
         WHERE case_id = $1 AND binding_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        [caseId, bindingId]
      ),
    ]);

    res.json({
      days,
      painHotspots: painStats.rows,
      usage: usageStats.rows[0] || { avg_wear_minutes: 0, avg_comfort: 0, log_days: 0 },
      recentNotes: recentNotes.rows,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/unbind', resolveBinding, async (req, res, next) => {
  try {
    await query('DELETE FROM patient_bindings WHERE id = $1', [req.binding.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
