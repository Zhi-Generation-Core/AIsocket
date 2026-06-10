const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../config/database');

async function initDatabase() {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('找不到 schema.sql');
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    console.log('正在初始化 SocketAI 数据库 schema...');
    await pool.query(sql);
    console.log('✅ schema 初始化完成');
    process.exit(0);
  } catch (error) {
    console.error('❌ 初始化失败:', error.message);
    process.exit(1);
  }
}

initDatabase();
