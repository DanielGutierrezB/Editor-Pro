'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');
const { exec, execFile } = require('child_process');
const path = require('path');

// ── Shared helpers ────────────────────────────────────────────────────────────

function _findFfmpeg(callback) {
  const candidates = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  let idx = 0;
  function next() {
    if (idx >= candidates.length) return callback(null);
    exec(candidates[idx] + ' -version 2>/dev/null', { timeout: 3000 }, (err) => {
      if (!err) return callback(candidates[idx]);
      idx++;
      next();
    });
  }
  next();
}

function _downloadToFile(url, outputPath, callback) {
  const parsed = new URL(url);
  const lib = parsed.protocol === 'https:' ? https : http;
  const file = fs.createWriteStream(outputPath);
  lib.get(url, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      file.close();
      return _downloadToFile(res.headers.location, outputPath, callback);
    }
    res.pipe(file);
    file.on('finish', () => file.close(() => callback(null, outputPath)));
  }).on('error', (err) => {
    fs.unlink(outputPath, () => {});
    callback(err);
  });
}

// ── Placeholder: PNG → MP4 via ffmpeg ────────────────────────────────────────

function _generatePlaceholderVideo(imagePath, durationSecs, outputPath, callback) {
  _findFfmpeg((ffmpeg) => {
    if (!ffmpeg) return callback(new Error('ffmpeg not found — required for placeholder video'));
    const dur = Math.max(1, Math.round(durationSecs)) || 5;
    execFile(ffmpeg, [
      '-loop', '1',
      '-i', imagePath,
      '-c:v', 'libx264',
      '-t', String(dur),
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
      '-movflags', '+faststart',
      '-y', outputPath,
    ], { timeout: 60000 }, (err) => callback(err, outputPath));
  });
}

// ── LTX Video local ───────────────────────────────────────────────────────────

function _generateLtxLocal(imagePath, durationSecs, prompt, endpointUrl, outputPath, callback) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const body = JSON.stringify({
    image: imageBase64,
    prompt: prompt || 'Smooth cinematic camera motion, high quality video',
    duration: Math.min(10, Math.max(1, durationSecs)),
    fps: 24,
    width: 1920,
    height: 1080,
  });
  const url = new URL(endpointUrl || 'http://localhost:7861');
  const apiPath = url.pathname.replace(/\/?$/, '') + '/api/image2video';
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const req = lib.request({
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: apiPath,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) return callback(new Error('LTX error: ' + parsed.error));
        if (parsed.video_base64) {
          const videoBuf = Buffer.from(parsed.video_base64, 'base64');
          return fs.writeFile(outputPath, videoBuf, (e) => callback(e, outputPath));
        }
        if (parsed.video_url) return _downloadToFile(parsed.video_url, outputPath, callback);
        callback(new Error('No video in LTX response'));
      } catch (e) {
        callback(new Error('LTX parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(300000, () => { req.destroy(); callback(new Error('LTX local timeout (5 min)')); });
  req.write(body);
  req.end();
}

// ── Kling API ─────────────────────────────────────────────────────────────────

function _generateKling(imagePath, durationSecs, prompt, apiKey, outputPath, callback) {
  if (!apiKey) return callback(new Error('Kling API key required'));

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const body = JSON.stringify({
    model_name: 'kling-v1',
    image: 'data:image/png;base64,' + imageBase64,
    prompt: prompt || 'Smooth cinematic motion, high quality video, professional look',
    duration: Math.min(10, Math.max(5, Math.round(durationSecs))).toString(),
    mode: 'std',
    cfg_scale: 0.5,
  });

  const req = https.request({
    hostname: 'api.klingai.com',
    path: '/v1/videos/image2video',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Bearer ' + apiKey,
    },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.code !== 0) return callback(new Error('Kling error: ' + (parsed.message || JSON.stringify(parsed))));
        const taskId = parsed.data && parsed.data.task_id;
        if (!taskId) return callback(new Error('No task_id from Kling'));
        _pollKlingTask(taskId, apiKey, outputPath, callback);
      } catch (e) {
        callback(new Error('Kling parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(30000, () => { req.destroy(); callback(new Error('Kling submit timeout')); });
  req.write(body);
  req.end();
}

function _pollKlingTask(taskId, apiKey, outputPath, callback) {
  let polls = 0;
  const maxPolls = 60; // 5 min at 5s intervals
  function poll() {
    polls++;
    if (polls > maxPolls) return callback(new Error('Kling task timeout'));
    const req = https.request({
      hostname: 'api.klingai.com',
      path: '/v1/videos/image2video/' + taskId,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + apiKey },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.code !== 0) return callback(new Error('Kling poll error: ' + parsed.message));
          const status = parsed.data && parsed.data.task_status;
          if (status === 'succeed') {
            const videoUrl = parsed.data.task_result && parsed.data.task_result.videos && parsed.data.task_result.videos[0] && parsed.data.task_result.videos[0].url;
            if (!videoUrl) return callback(new Error('No video URL in Kling result'));
            return _downloadToFile(videoUrl, outputPath, callback);
          }
          if (status === 'failed') return callback(new Error('Kling task failed: ' + JSON.stringify(parsed.data)));
          setTimeout(poll, 5000);
        } catch (e) {
          callback(new Error('Kling poll parse error: ' + e.message));
        }
      });
    });
    req.on('error', callback);
    req.setTimeout(15000, () => { req.destroy(); setTimeout(poll, 5000); });
    req.end();
  }
  setTimeout(poll, 5000);
}

// ── FAL.ai queue API (image-to-video) ─────────────────────────────────────────

function _generateFalVideo(imagePath, durationSecs, prompt, apiKey, model, outputPath, callback) {
  if (!apiKey) return callback(new Error('FAL.ai API key required'));

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const imageUrl = 'data:image/png;base64,' + imageBase64;

  const falModel = model || 'fal-ai/kling-video/v2/master/image-to-video';
  const body = JSON.stringify({
    prompt: prompt || 'Smooth cinematic motion, high quality video, professional look',
    image_url: imageUrl,
    duration: '5',
    aspect_ratio: '16:9',
  });

  const req = https.request({
    hostname: 'queue.fal.run',
    path: '/' + falModel,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Authorization': 'Key ' + apiKey,
    },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.detail || parsed.error) {
          return callback(new Error('FAL submit error: ' + (parsed.detail || parsed.error)));
        }
        const requestId = parsed.request_id;
        if (!requestId) return callback(new Error('No request_id from FAL: ' + data.substring(0, 300)));
        _pollFalQueue(falModel, requestId, apiKey, outputPath, callback);
      } catch (e) {
        callback(new Error('FAL submit parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(30000, () => { req.destroy(); callback(new Error('FAL submit timeout')); });
  req.write(body);
  req.end();
}

function _pollFalQueue(model, requestId, apiKey, outputPath, callback) {
  let polls = 0;
  const maxPolls = 120; // 120 × 5s = 10 min
  function poll() {
    polls++;
    if (polls > maxPolls) return callback(new Error('FAL queue timeout'));
    const req = https.request({
      hostname: 'queue.fal.run',
      path: '/' + model + '/requests/' + requestId + '/status',
      method: 'GET',
      headers: { 'Authorization': 'Key ' + apiKey },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const status = parsed.status;
          if (status === 'COMPLETED') {
            return _fetchFalResult(model, requestId, apiKey, outputPath, callback);
          }
          if (status === 'FAILED') {
            return callback(new Error('FAL task failed: ' + JSON.stringify(parsed)));
          }
          // IN_QUEUE or IN_PROGRESS — keep polling
          setTimeout(poll, 5000);
        } catch (e) {
          callback(new Error('FAL poll parse error: ' + e.message));
        }
      });
    });
    req.on('error', callback);
    req.setTimeout(15000, () => { req.destroy(); setTimeout(poll, 5000); });
    req.end();
  }
  setTimeout(poll, 5000);
}

function _fetchFalResult(model, requestId, apiKey, outputPath, callback) {
  const req = https.request({
    hostname: 'queue.fal.run',
    path: '/' + model + '/requests/' + requestId + '/response',
    method: 'GET',
    headers: { 'Authorization': 'Key ' + apiKey },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        const videoUrl = parsed.video && parsed.video.url;
        if (!videoUrl) return callback(new Error('No video URL in FAL result: ' + data.substring(0, 300)));
        _downloadToFile(videoUrl, outputPath, callback);
      } catch (e) {
        callback(new Error('FAL result parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(30000, () => { req.destroy(); callback(new Error('FAL result fetch timeout')); });
  req.end();
}

// ── Gemini Veo (Google AI image-to-video) ─────────────────────────────────────

function _generateGeminiVideo(imagePath, prompt, apiKey, outputPath, callback) {
  if (!apiKey) return callback(new Error('Google AI API key required for gemini_video provider'));

  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        { text: prompt || 'Create a short video with smooth cinematic camera motion from this image, high quality, professional look' },
      ],
    }],
    generationConfig: { responseModalities: ['VIDEO'] },
  });

  const req = https.request({
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models/gemini-2.5-flash-preview-image-generation:generateContent?key=' + encodeURIComponent(apiKey),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          return callback(new Error('Gemini Veo API error: ' + (parsed.error.message || JSON.stringify(parsed.error))));
        }
        const candidate = parsed.candidates && parsed.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
          return callback(new Error('Gemini Veo: no candidates in response'));
        }
        const videoPart = candidate.content.parts.find(
          (p) => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('video/')
        );
        if (!videoPart) {
          const textPart = candidate.content.parts.find((p) => p.text);
          const msg = textPart ? textPart.text.substring(0, 300) : 'no video in response';
          return callback(new Error('Gemini Veo returned no video: ' + msg));
        }
        const videoBuf = Buffer.from(videoPart.inlineData.data, 'base64');
        fs.writeFile(outputPath, videoBuf, (err) => callback(err, outputPath));
      } catch (e) {
        callback(new Error('Gemini Veo parse error: ' + e.message + ' raw: ' + data.substring(0, 300)));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(120000, () => { req.destroy(); callback(new Error('Gemini Veo timeout (120s)')); });
  req.write(body);
  req.end();
}

// ── Main entry point ──────────────────────────────────────────────────────────

function generateVideo(options, outputPath, callback) {
  const { provider, imagePath, durationSecs, prompt, endpointUrl, apiKey, model } = options;
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  switch (provider) {
    case 'ltx_local':    return _generateLtxLocal(imagePath, durationSecs, prompt, endpointUrl, outputPath, callback);
    case 'kling':        return _generateKling(imagePath, durationSecs, prompt, apiKey, outputPath, callback);
    case 'fal':          return _generateFalVideo(imagePath, durationSecs, prompt, apiKey, model, outputPath, callback);
    case 'gemini_video': return _generateGeminiVideo(imagePath, prompt, apiKey, outputPath, callback);
    case 'placeholder':
    default:             return _generatePlaceholderVideo(imagePath, durationSecs, outputPath, callback);
  }
}

module.exports = { generateVideo };
