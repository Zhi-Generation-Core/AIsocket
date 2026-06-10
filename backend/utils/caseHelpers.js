const crypto = require('crypto');
const { query } = require('../config/database');

async function assertCaseAccess(caseId, orgId) {
  const result = await query(
    'SELECT id, org_id FROM cases WHERE id = $1',
    [caseId]
  );
  if (result.rows.length === 0) {
    const error = new Error('病例不存在');
    error.status = 404;
    throw error;
  }
  if (result.rows[0].org_id !== orgId) {
    const error = new Error('无权访问该病例');
    error.status = 403;
    throw error;
  }
  return result.rows[0];
}

async function nextVersionNumber(caseId) {
  const result = await query(
    'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM socket_versions WHERE case_id = $1',
    [caseId]
  );
  return Number(result.rows[0].next);
}

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function mapCaseRow(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    patientId: row.patient_id,
    createdBy: row.created_by,
    title: row.title,
    amputationSite: row.amputation_site,
    side: row.side,
    activityLevel: row.activity_level,
    status: row.status,
    initialModelingDate: row.initial_modeling_date,
    notes: row.notes,
    patientName: row.patient_name,
    patientAnonymousCode: row.patient_anonymous_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionRow(row) {
  return {
    id: row.id,
    caseId: row.case_id,
    scanId: row.scan_id,
    versionNumber: row.version_number,
    label: row.label,
    source: row.source,
    status: row.status,
    parameters: row.parameters,
    patientContext: row.patient_context,
    geometrySummary: row.geometry_summary,
    riskZones: row.risk_zones,
    refinement: row.refinement,
    semanticActions: row.semantic_actions,
    volumeConservation: row.volume_conservation,
    versionDelta: row.version_delta,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

module.exports = {
  assertCaseAccess,
  nextVersionNumber,
  generateInviteCode,
  mapCaseRow,
  mapVersionRow,
};
