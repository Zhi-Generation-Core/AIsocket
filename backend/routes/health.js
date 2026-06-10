const express = require('express');
const { getGeminiConfig, callGeminiRefine } = require('../utils/geminiRefine');

const router = express.Router();

router.get('/health', (req, res) => {
  const config = getGeminiConfig();
  res.json({
    ok: true,
    service: 'socketai-api',
    hasGeminiKey: config.hasGeminiKey,
    model: config.model,
    timestamp: new Date().toISOString(),
  });
});

router.post('/gemini-refine', async (req, res) => {
  try {
    const { model, result } = await callGeminiRefine(req.body || {});
    res.json({ ok: true, model, result });
  } catch (error) {
    const status = error.code === 'MISSING_GEMINI_KEY' ? 500 : (error.status || 500);
    res.status(status).json({
      ok: false,
      error: error.message,
      model: getGeminiConfig().model,
    });
  }
});

module.exports = router;
