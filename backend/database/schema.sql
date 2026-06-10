-- SocketAI 独立 schema（库名 socketai，与 zjunanashi 完全分离）

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 机构
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户（技师 / 机构管理员）
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'technician'
        CHECK (role IN ('admin', 'technician')),
    display_name VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, username),
    UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- 患者（可匿名编号）
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    display_name VARCHAR(128) NOT NULL,
    anonymous_code VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(org_id);

-- 病例
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    amputation_site VARCHAR(128),
    side VARCHAR(16) NOT NULL DEFAULT 'right'
        CHECK (side IN ('left', 'right', 'unknown')),
    activity_level VARCHAR(8) NOT NULL DEFAULT 'K3',
    status VARCHAR(32) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    initial_modeling_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id);
CREATE INDEX IF NOT EXISTS idx_cases_patient ON cases(patient_id);

-- 残肢扫描资产
CREATE TABLE IF NOT EXISTS scan_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(512) NOT NULL,
    file_path TEXT NOT NULL,
    format VARCHAR(16) NOT NULL CHECK (format IN ('stl', 'obj', 'other')),
    file_size_bytes BIGINT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_assets_case ON scan_assets(case_id);

-- 接受腔版本
CREATE TABLE IF NOT EXISTS socket_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES scan_assets(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL,
    label VARCHAR(128) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'algorithm',
    status VARCHAR(32) NOT NULL DEFAULT 'ai_initial'
        CHECK (status IN (
            'ai_initial',
            'fitting_adjustment',
            'follow_up',
            'manufacturing_confirmed'
        )),
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    patient_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    geometry_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    risk_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
    refinement JSONB,
    semantic_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    volume_conservation JSONB,
    version_delta JSONB,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (case_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_socket_versions_case ON socket_versions(case_id);

-- AI 复核日志
CREATE TABLE IF NOT EXISTS refine_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    version_id UUID REFERENCES socket_versions(id) ON DELETE SET NULL,
    model_name VARCHAR(128),
    input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refine_logs_case ON refine_logs(case_id);

-- 导出记录
CREATE TABLE IF NOT EXISTS export_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    version_id UUID NOT NULL REFERENCES socket_versions(id) ON DELETE CASCADE,
    exported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    file_name VARCHAR(512),
    file_path TEXT,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_records_case ON export_records(case_id);

-- 移动端邀请码
CREATE TABLE IF NOT EXISTS case_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    invite_code VARCHAR(32) NOT NULL UNIQUE,
    patient_label VARCHAR(128),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_invites_case ON case_invites(case_id);

-- 患者绑定（移动端）
CREATE TABLE IF NOT EXISTS patient_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invite_id UUID NOT NULL REFERENCES case_invites(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    device_label VARCHAR(128),
    bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_bindings_case ON patient_bindings(case_id);

-- 疼痛反馈
CREATE TABLE IF NOT EXISTS pain_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES patient_bindings(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    region_id VARCHAR(64) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
    pain_type VARCHAR(32),
    activity_scene VARCHAR(64),
    notes TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pain_feedback_case ON pain_feedback(case_id);

-- 使用日志
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES patient_bindings(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    wear_minutes INTEGER NOT NULL DEFAULT 0 CHECK (wear_minutes >= 0),
    comfort_score SMALLINT CHECK (comfort_score IS NULL OR (comfort_score >= 1 AND comfort_score <= 5)),
    activity_scene VARCHAR(64),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_case ON usage_logs(case_id);

-- 通用反馈（文字/复诊总结）
CREATE TABLE IF NOT EXISTS mobile_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES patient_bindings(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    feedback_type VARCHAR(32) NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_feedback_case ON mobile_feedback(case_id);

-- updated_at 触发器
CREATE OR REPLACE FUNCTION socketai_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE PROCEDURE socketai_set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE socketai_set_updated_at();

DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
CREATE TRIGGER trg_patients_updated
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE PROCEDURE socketai_set_updated_at();

DROP TRIGGER IF EXISTS trg_cases_updated ON cases;
CREATE TRIGGER trg_cases_updated
    BEFORE UPDATE ON cases
    FOR EACH ROW EXECUTE PROCEDURE socketai_set_updated_at();

-- 应用角色权限（若使用 socketai_app 连接）
GRANT USAGE ON SCHEMA public TO socketai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO socketai_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO socketai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO socketai_app;
