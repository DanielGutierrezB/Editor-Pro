/**
 * LLM wrapper — multi-provider support for motion-server
 * Mirrors the provider logic from ai-analyzer.js but runs server-side.
 *
 * All providers share the same transport/response-parsing shape (build a
 * JSON body → POST it → parse JSON → check for an API-level error → extract
 * the text). That shared shape lives in _httpJson(); each provider only
 * supplies the small bits that actually differ: host/path/protocol, how to
 * build the request body (with or without an image), and how to pull the
 * text back out of the response.
 */
const https = require('https');
const http = require('http');

const PROVIDERS = {
  ollama: {
    protocol: 'http',
    host: 'localhost',
    port: 11434,
    path: '/api/chat',
  },
  google: {
    protocol: 'https',
    host: 'generativelanguage.googleapis.com',
  },
  anthropic: {
    protocol: 'https',
    host: 'api.anthropic.com',
    path: '/v1/messages',
  },
  openai: {
    protocol: 'https',
    host: 'api.openai.com',
    path: '/v1/chat/completions',
  },
  openrouter: {
    protocol: 'https',
    host: 'openrouter.ai',
    path: '/api/v1/chat/completions',
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

/**
 * Shared transport core for every provider/vision combination below.
 * `req` describes exactly what varies per call: { host, port, path, protocol, headers, body }.
 * `extractText(parsed)` pulls the model's text out of the provider's JSON shape.
 */
function _httpJson(req, extractText, callback) {
  const transport = req.protocol === 'http' ? http : https;
  let callbackFired = false;
  const safeCb = (err, result) => { if (!callbackFired) { callbackFired = true; callback(err, result); } };

  const httpReq = transport.request({
    hostname: req.host,
    port: req.port,
    path: req.path,
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(req.body) },
      req.headers || {}
    ),
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const errMsg = _extractErrorMessage(parsed);
        if (errMsg) {
          console.error('[llm] API error from ' + req.host + ': ' + errMsg);
          return safeCb(new Error(errMsg));
        }
        const text = extractText(parsed) || '';
        if (!text) {
          console.warn('[llm] Empty content from ' + req.host + '. Response keys:', Object.keys(parsed).join(','));
        }
        safeCb(null, text);
      } catch (e) {
        safeCb(new Error('Parse error: ' + e.message));
      }
    });
  });
  httpReq.on('error', safeCb);
  httpReq.setTimeout(120000, function() { httpReq.destroy(); safeCb(new Error('LLM request timeout after 120s')); });
  httpReq.write(req.body);
  httpReq.end();
}

/** Recognizes the Anthropic (`type`/`error`) and OpenAI-compatible (`error.message`) error shapes. */
function _extractErrorMessage(parsed) {
  if (!parsed || (parsed.type !== 'error' && !parsed.error)) return null;
  const err = parsed.error;
  return (err && err.message) || JSON.stringify(err || parsed);
}

// ── Per-provider request builders ───────────────────────────────────────────
// Each returns { req: {host, port, path, protocol, headers, body}, extractText }.
// `image` is an optional base64 PNG string — when present, builds the vision variant.

function _buildOllamaCall(cfg, model, apiKey, systemMsg, userMsg, image) {
  const userMessage = { role: 'user', content: userMsg };
  if (image) userMessage.images = [image];
  return {
    req: {
      protocol: 'http', host: cfg.host, port: cfg.port, path: cfg.path,
      body: JSON.stringify({
        model: model || (image ? 'llava' : 'mistral-small3.1:latest'),
        messages: [{ role: 'system', content: systemMsg }, userMessage],
        stream: false,
      }),
    },
    extractText: (parsed) => parsed.message && parsed.message.content,
  };
}

function _buildGoogleCall(cfg, model, apiKey, systemMsg, userMsg, image) {
  const m = model || 'gemini-2.0-flash';
  const parts = image
    ? [{ inline_data: { mime_type: 'image/png', data: image } }, { text: userMsg }]
    : [{ text: userMsg }];
  return {
    req: {
      protocol: 'https', host: cfg.host,
      path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemMsg }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0.7 },
      }),
    },
    extractText: (parsed) => parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content
      && parsed.candidates[0].content.parts && parsed.candidates[0].content.parts[0]
      && parsed.candidates[0].content.parts[0].text,
  };
}

function _buildAnthropicCall(cfg, model, apiKey, systemMsg, userMsg, image) {
  const content = image
    ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: image } }, { type: 'text', text: userMsg }]
    : userMsg;
  return {
    req: {
      protocol: 'https', host: cfg.host, path: cfg.path,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: image ? 4096 : 16000,
        system: systemMsg,
        messages: [{ role: 'user', content }],
      }),
    },
    extractText: (parsed) => parsed.content && parsed.content[0] && parsed.content[0].text,
  };
}

function _buildOpenAICall(cfg, model, apiKey, systemMsg, userMsg, image) {
  const userContent = image
    ? [{ type: 'text', text: userMsg }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + image } }]
    : userMsg;
  return {
    req: {
      protocol: 'https', host: cfg.host, path: cfg.path,
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userContent }],
        temperature: 0.7,
      }),
    },
    extractText: (parsed) => parsed.choices && parsed.choices[0] && parsed.choices[0].message
      && parsed.choices[0].message.content,
  };
}

const CALL_BUILDERS = {
  ollama: _buildOllamaCall,
  google: _buildGoogleCall,
  anthropic: _buildAnthropicCall,
  // openai + openrouter share the same OpenAI-compatible format
  openai: _buildOpenAICall,
  openrouter: _buildOpenAICall,
};

function _send(provider, model, apiKey, systemMsg, userMsg, image, callback) {
  const resolved = _resolveProviderModel(provider, model, apiKey);
  const p = resolved.provider;
  const cfg = PROVIDERS[p];
  const buildCall = CALL_BUILDERS[p];
  if (!cfg || !buildCall) {
    console.error('[llm] Unknown provider: ' + p);
    return callback(new Error('Unknown provider: ' + p));
  }

  const promptLen = (systemMsg || '').length + (userMsg || '').length;
  console.log('[llm] send' + (image ? 'Vision' : '') + ' provider=' + p + ' model=' + resolved.model + ' promptChars=' + promptLen);

  const call = buildCall(cfg, resolved.model, apiKey, systemMsg, userMsg, image);
  _httpJson(call.req, call.extractText, callback);
}

function sendLLM({ provider, model, apiKey, systemMsg, userMsg }, callback) {
  _send(provider, model, apiKey, systemMsg, userMsg, null, callback);
}

/**
 * sendLLMWithVision — like sendLLM but includes a base64 image in the user message.
 * Supports OpenRouter, OpenAI, Anthropic, Google, and Ollama vision models.
 */
function sendLLMWithVision({ provider, model, apiKey, systemMsg, userMsg, imageBase64 }, callback) {
  _send(provider, model, apiKey, systemMsg, userMsg, imageBase64, callback);
}

module.exports = { sendLLM, sendLLMWithVision };
