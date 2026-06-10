const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

function cleanJsonText(text) {
  let cleaned = String(text || '').trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  return cleaned;
}

function buildRefinePrompt(payload) {
  const summary = payload.summary || {};
  return `
You are the AI review module in a prosthetic socket design demo.
Review the algorithm-generated initial socket using the parameters, geometry summary,
semantic segmentation labels, and optional preview image. Return only structured JSON
for conservative parameter correction and a risk heatmap.

Rules:
- Output JSON only. No Markdown.
- Do not claim medical diagnosis. This is a classroom design demo.
- Keep corrections conservative; avoid changing the initial design dramatically.
- Heatmap coordinates use normalized socket coordinates: y is height ratio 0..1,
  theta is circumferential position 0..1, where theta=0 means anterior/front.
- Treat semanticSegmentation labels as model-side design evidence: bony prominence
  labels should usually increase local relief, posterior soft tissue can be a safer
  load-bearing area, and distal labels need conservative containment.
- Do not invent deformation millimeters directly for semantic regions. Instead, use
  clinicalRuleBase and return semanticWeights from 0.1 to 1.0. The local geometry
  script converts maxDeformationMm * weight into the final Gaussian deformation.
- Use patient context as an adjustment multiplier: higher activity levels usually
  need stronger stability and containment; heavier patients need more conservative
  pressure distribution; fleshy residual limbs need more volume allowance.
- Consider volumeConservation and versionDelta. If a previous version exists, make
  a calibrated change based on the delta instead of redesigning blindly.
- severity must be one of: high, medium, low.
- color must be one of: red, yellow, green.
- Use concise Chinese strings for label, reason, and clinicalNotes.

Current model summary:
${JSON.stringify(summary, null, 2)}

Return exactly this JSON shape:
{
  "parameterCorrections": {
    "offsetDeltaMm": number,
    "trimDeltaPercent": number,
    "reliefDeltaMm": number,
    "distalDeltaMm": number
  },
  "riskZones": [
    {
      "id": "anterior_tibia",
      "label": "前内侧胫骨",
      "severity": "high",
      "color": "red",
      "y": 0.52,
      "theta": 0.0,
      "radius": 0.16,
      "reason": "骨性突起附近压力集中，需要优先减压"
    }
  ],
  "semanticWeights": {
    "anterior_tibia": 0.7,
    "fibula_head": 0.6,
    "distal_end": 0.5,
    "posterior_soft_tissue": 0.4
  },
  "clinicalNotes": [
    "一句简短、可解释的建议"
  ],
  "confidence": 0.0
}
`;
}

async function callGeminiRefine(payload) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const baseUrl = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');

  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not set in the environment.');
    error.code = 'MISSING_GEMINI_KEY';
    throw error;
  }

  const imageDataUrl = payload.imageDataUrl || '';
  let imageBase64 = '';
  if (imageDataUrl.startsWith('data:image/png;base64,')) {
    imageBase64 = imageDataUrl.split(',', 2)[1];
  }

  const parts = [{ text: buildRefinePrompt(payload) }];
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: imageBase64,
      },
    });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
    },
  };

  const url = `${baseUrl}/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const error = new Error(rawText || `Gemini HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const raw = JSON.parse(rawText);
  const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return {
    model,
    result: JSON.parse(cleanJsonText(text)),
  };
}

function getGeminiConfig() {
  return {
    hasGeminiKey: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
  };
}

module.exports = {
  callGeminiRefine,
  getGeminiConfig,
  DEFAULT_MODEL,
};
