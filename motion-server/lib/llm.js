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

function sendLLM({ provider, model, apiKey, systemMsg, userMsg }, callback) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return callback(new Error('Unknown provider: ' + provider));

  if (provider === 'ollama') {
    return _sendOllama(cfg, model, systemMsg, userMsg, callback);
  }
  if (provider === 'google') {
    return _sendGoogle(model, apiKey, systemMsg, userMsg, callback);
  }
  if (provider === 'anthropic') {
    return _sendAnthropic(cfg, model, apiKey, systemMsg, userMsg, callback);
  }
  // openai + openrouter share the same format
  return _sendOpenAI(cfg, model, apiKey, systemMsg, userMsg, callback);
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

  const req = http.request({
    hostname: cfg.host,
    port: cfg.port,
    path: cfg.path,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.message?.content || '';
        callback(null, text);
      } catch (e) {
        callback(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
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

  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${m}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        callback(null, text);
      } catch (e) {
        callback(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
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

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
        callback(null, text);
      } catch (e) {
        callback(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
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

  const req = https.request({
    hostname: cfg.host,
    path: cfg.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.message?.content || '';
        callback(null, text);
      } catch (e) {
        callback(new Error('Parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.write(body);
  req.end();
}

module.exports = { sendLLM };
