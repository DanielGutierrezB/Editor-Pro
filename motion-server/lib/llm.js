/**
 * LLM wrapper — multi-provider support for motion-server
 * Mirrors the provider logic from ai-analyzer.js but runs server-side.
 */
const https = require('https');
const http = require('http');

const PROVIDERS = {
  ollama: {
    host: 'localhost',
    port: 11434,
    path: '/api/chat',
    local: true,
  },
  google: {
    host: 'generativelanguage.googleapis.com',
    local: false,
  },
  anthropic: {
    host: 'api.anthropic.com',
    path: '/v1/messages',
    local: false,
  },
  openai: {
    host: 'api.openai.com',
    path: '/v1/chat/completions',
    local: false,
  },
  openrouter: {
    host: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    local: false,
  },
};

// ── Auto-correct provider/model mismatches ──────────────────────────────────
// Detects when API key doesn't match the selected provider and fixes the route.
// Also normalizes model names between OpenRouter (anthropic/claude-*) and
// Anthropic direct (claude-*-YYYYMMDD) formats.
const ANTHROPIC_MODEL_MAP = {
  'anthropic/claude-sonnet-4':  'claude-sonnet-4-20250514',
  'anthropic/claude-opus-4':    'claude-opus-4-20250514',
  'anthropic/claude-haiku-4':   'claude-haiku-4-20250514',
};
const REVERSE_ANTHROPIC_MODEL_MAP = Object.fromEntries(
  Object.entries(ANTHROPIC_MODEL_MAP).map(([k, v]) => [v, k])
);

function _resolveProviderModel(provider, model, apiKey) {
  let p = provider;
  let m = model;

  // Key-based auto-detect: key type overrides declared provider when they conflict
  if (apiKey) {
    if (apiKey.startsWith('sk-ant-') && p === 'openrouter') {
      console.log('[llm] Auto-correcting provider openrouter → anthropic (key is sk-ant-*)');
      p = 'anthropic';
    } else if (apiKey.startsWith('sk-or-') && p === 'anthropic') {
      console.log('[llm] Auto-correcting provider anthropic → openrouter (key is sk-or-*)');
      p = 'openrouter';
    }
  }

  // Model format normalization
  if (p === 'anthropic' && m && m.includes('/')) {
    // OpenRouter format → Anthropic direct format
    const mapped = ANTHROPIC_MODEL_MAP[m];
    if (mapped) {
      console.log('[llm] Model remap for anthropic: ' + m + ' → ' + mapped);
      m = mapped;
    } else {
      // Generic strip: "anthropic/claude-xxx" → "claude-xxx"
      const stripped = m.replace(/^anthropic\//, '');
      console.log('[llm] Model strip prefix for anthropic: ' + m + ' → ' + stripped);
      m = stripped;
    }
  } else if (p === 'openrouter' && m && !m.includes('/')) {
    // Anthropic direct format → OpenRouter format
    const mapped = REVERSE_ANTHROPIC_MODEL_MAP[m];
    if (mapped) {
      console.log('[llm] Model remap for openrouter: ' + m + ' → ' + mapped);
      m = mapped;
    }
  }

  return { provider: p, model: m };
}

function sendLLM({ provider, model, apiKey, systemMsg, userMsg }, callback) {
  const resolved = _resolveProviderModel(provider, model, apiKey);
  const p = resolved.provider;
  const m = resolved.model;
  const cfg = PROVIDERS[p];
  if (!cfg) return callback(new Error('Unknown provider: ' + p));

  if (p === 'ollama') {
    return _sendOllama(cfg, m, systemMsg, userMsg, callback);
  }
  if (p === 'google') {
    return _sendGoogle(m, apiKey, systemMsg, userMsg, callback);
  }
  if (p === 'anthropic') {
    return _sendAnthropic(cfg, m, apiKey, systemMsg, userMsg, callback);
  }
  // openai + openrouter share the same format
  return _sendOpenAI(cfg, m, apiKey, systemMsg, userMsg, callback);
}

function _sendOllama(cfg, model, systemMsg, userMsg, callback) {
  const body = JSON.stringify({
    model: model || 'mistral-small3.1:latest',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ],
    stream: false,
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = http.request({
    hostname: cfg.host,
    port: cfg.port,
    path: cfg.path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.message?.content || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendGoogle(model, apiKey, systemMsg, userMsg, callback) {
  const m = model || 'gemini-2.0-flash';
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemMsg }] },
    contents: [{ parts: [{ text: userMsg }] }],
    generationConfig: { temperature: 0.7 },
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendAnthropic(cfg, model, apiKey, systemMsg, userMsg, callback) {
  const body = JSON.stringify({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    system: systemMsg,
    messages: [{ role: 'user', content: userMsg }],
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.content?.[0]?.text || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendOpenAI(cfg, model, apiKey, systemMsg, userMsg, callback) {
  const body = JSON.stringify({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.7,
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${apiKey}`,
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.message?.content || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

/**
 * sendLLMWithVision — like sendLLM but includes a base64 image in the user message.
 * Supports OpenRouter, OpenAI, Anthropic, Google, and Ollama vision models.
 */
function sendLLMWithVision({ provider, model, apiKey, systemMsg, userMsg, imageBase64 }, callback) {
  const resolved = _resolveProviderModel(provider, model, apiKey);
  const p = resolved.provider;
  const m = resolved.model;
  const cfg = PROVIDERS[p];
  if (!cfg) return callback(new Error('Unknown provider: ' + p));

  const dataUri = 'data:image/png;base64,' + imageBase64;

  if (p === 'anthropic') {
    return _sendAnthropicVision(cfg, m, apiKey, systemMsg, userMsg, imageBase64, callback);
  }
  if (p === 'google') {
    return _sendGoogleVision(m, apiKey, systemMsg, userMsg, imageBase64, callback);
  }
  if (p === 'ollama') {
    return _sendOllamaVision(cfg, m, systemMsg, userMsg, imageBase64, callback);
  }
  // openai + openrouter share the same OpenAI-compatible vision format
  return _sendOpenAIVision(cfg, m, apiKey, systemMsg, userMsg, dataUri, callback);
}

function _sendAnthropicVision(cfg, model, apiKey, systemMsg, userMsg, imageBase64, callback) {
  const body = JSON.stringify({
    model: model || 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemMsg,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageBase64 } },
        { type: 'text', text: userMsg },
      ],
    }],
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.content?.[0]?.text || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendGoogleVision(model, apiKey, systemMsg, userMsg, imageBase64, callback) {
  const m = model || 'gemini-2.0-flash';
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemMsg }] },
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/png', data: imageBase64 } },
        { text: userMsg },
      ],
    }],
    generationConfig: { temperature: 0.7 },
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendOllamaVision(cfg, model, systemMsg, userMsg, imageBase64, callback) {
  const body = JSON.stringify({
    model: model || 'llava',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg, images: [imageBase64] },
    ],
    stream: false,
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = http.request({
    hostname: cfg.host,
    port: cfg.port,
    path: cfg.path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.message?.content || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

function _sendOpenAIVision(cfg, model, apiKey, systemMsg, userMsg, dataUri, callback) {
  const body = JSON.stringify({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: [
        { type: 'text', text: userMsg },
        { type: 'image_url', image_url: { url: dataUri } },
      ]},
    ],
    temperature: 0.7,
  });

  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': `Bearer ${apiKey}`,
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.message?.content || '';
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', safeCb);
  req.setTimeout(120000, function() { req.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  req.write(body);
  req.end();
}

module.exports = { sendLLM, sendLLMWithVision };
