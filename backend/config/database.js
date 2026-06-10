const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'socketai',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[socketai-db] 连接池错误:', err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[socketai-db]', { duration: Date.now() - start, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('[socketai-db] 查询失败:', error.message);
    throw error;
  }
}

module.exports = { pool, query };
