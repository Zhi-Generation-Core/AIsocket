const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { checkRateLimit } = require('../utils/authRateLimit');
const {
  normalizeEmail,
  normalizeUsername,
  validatePassword,
  publicUser,
  authConfig,
} = require('../utils/authHelpers');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

function signToken(userId, orgId) {
  return jwt.sign({ userId, orgId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function findUserByLogin(login) {
  const value = String(login || '').trim();
  if (!value) return null;

  const byEmail = await query(
    `SELECT id, org_id, username, email, password_hash, role, display_name
     FROM users WHERE email = $1`,
    [normalizeEmail(value)]
  );
  if (byEmail.rows.length) return byEmail.rows[0];

  const byUsername = await query(
    `SELECT id, org_id, username, email, password_hash, role, display_name
     FROM users WHERE username = $1`,
    [normalizeUsername(value)]
  );
  return byUsername.rows[0] || null;
}

router.get('/config', (_req, res) => {
  res.json(authConfig());
});

router.post('/login', async (req, res, next) => {
  try {
    checkRateLimit(req);

    const { email, username, password } = req.body || {};
    const login = email || username;
    if (!login || !password) {
      return res.status(400).json({ error: '请提供邮箱或用户名及密码' });
    }

    const user = await findUserByLogin(login);
    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    res.json({
      token: signToken(user.id, user.org_id),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/register', async (req, res, next) => {
  try {
    checkRateLimit(req);

    if (process.env.ALLOW_PUBLIC_REGISTER !== 'true') {
      return res.status(403).json({ error: '当前未开放自助注册，请联系机构管理员' });
    }

    const { orgName, username, email, password, displayName } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);
    const passwordError = validatePassword(password);

    if (!orgName || !normalizedUsername || !normalizedEmail || passwordError) {
      return res.status(400).json({
        error: passwordError || '机构名称、用户名、邮箱和密码均为必填',
      });
    }

    const orgId = uuidv4();
    const userId = uuidv4();
    const hash = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

    await query('INSERT INTO organizations (id, name) VALUES ($1, $2)', [orgId, String(orgName).trim()]);
    await query(
      `INSERT INTO users (id, org_id, username, email, password_hash, role, display_name)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6)`,
      [userId, orgId, normalizedUsername, normalizedEmail, hash, displayName || normalizedUsername]
    );

    const user = {
      id: userId,
      org_id: orgId,
      username: normalizedUsername,
      email: normalizedEmail,
      role: 'admin',
      display_name: displayName || normalizedUsername,
    };

    res.status(201).json({
      token: signToken(userId, orgId),
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: '用户名或邮箱已被注册' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: error.message });
    }
    next(error);
  }
});

module.exports = router;
