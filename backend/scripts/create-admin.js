const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@socketai.local';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ORG_NAME = process.env.ADMIN_ORG_NAME || '默认机构';

async function main() {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    console.error('❌ 请通过环境变量 ADMIN_PASSWORD 设置至少 8 位的管理员密码');
    process.exit(1);
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (existing.rows.length > 0) {
    if (process.argv.includes('--reset-password')) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2', [hash, ADMIN_EMAIL]);
      console.log('✅ 已重置管理员密码');
    } else {
      console.log('ℹ️  管理员已存在，使用 --reset-password 可重置密码');
    }
    process.exit(0);
  }

  const orgId = uuidv4();
  const userId = uuidv4();
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [orgId, ORG_NAME]);
  await query(
    `INSERT INTO users (id, org_id, username, email, password_hash, role, display_name)
     VALUES ($1, $2, $3, $4, $5, 'admin', $6)`,
    [userId, orgId, ADMIN_USERNAME, ADMIN_EMAIL, hash, ADMIN_USERNAME]
  );

  console.log('✅ 已创建机构与管理員');
  console.log(`   机构: ${ORG_NAME}`);
  console.log(`   用户名: ${ADMIN_USERNAME}`);
  console.log(`   邮箱: ${ADMIN_EMAIL}`);
  console.log('   请尽快修改默认密码');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ 创建管理员失败:', error.message);
  process.exit(1);
});
