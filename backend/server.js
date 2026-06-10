const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const { pool } = require('./config/database');

const authRoutes = require('./routes/auth');
const healthRoutes = require('./routes/health');
const caseRoutes = require('./routes/cases');
const scanRoutes = require('./routes/scans');
const socketRoutes = require('./routes/socket');
const mobileRoutes = require('./routes/mobile');

const app = express();
const PORT = parseInt(process.env.PORT || '3010', 10);

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',').map((item) => item.trim()) || '*',
  credentials: true,
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'socketai-api', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api', healthRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/scans', scanRoutes);
app.use('/api/socket', socketRoutes);
app.use('/api/mobile', mobileRoutes);

app.use((err, req, res, _next) => {
  console.error('[socketai-api]', err);
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ SocketAI 数据库连接成功');
  } catch (error) {
    console.error('❌ SocketAI 数据库连接失败:', error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 SocketAI API 运行在端口 ${PORT}`);
  });
}

start();
