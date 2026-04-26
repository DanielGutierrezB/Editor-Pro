'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');
const { execFile, exec } = require('child_process');
const zlib = require('zlib');
const path = require('path');

// ── Placeholder: solid color PNG + text via ffmpeg ───────────────────────────

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

function _createPlaceholderPng(description, outputPath, callback) {
  const truncated = description.replace(/'/g, '').replace(/"/g, '').substring(0, 120);
  const words = truncated.split(' ');
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    if ((cur + ' ' + w).trim().length > 40) { lines.push(cur.trim()); cur = w; }
    else { cur = (cur + ' ' + w).trim(); }
  });
  if (cur) lines.push(cur.trim());
  const textLines = lines.slice(0, 4).join('\\n');

  _findFfmpeg((ffmpeg) => {
    if (ffmpeg) {
      const drawtext = textLines
        ? `drawtext=text='${textLines.replace(/:/g, '\\:')}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=10`
        : 'drawtext=text=B-Roll:fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2';
      execFile(ffmpeg, [
        '-f', 'lavfi',
        '-i', 'color=c=#1a1d23:s=1920x1080:r=1',
        '-vf', drawtext,
        '-frames:v', '1',
        '-y', outputPath,
      ], { timeout: 15000 }, (err) => {
        if (!err) return callback(null, outputPath);
        // fallback to solid color without text
        execFile(ffmpeg, [
          '-f', 'lavfi', '-i', 'color=c=#1a1d23:s=1920x1080:r=1',
          '-frames:v', '1', '-y', outputPath,
        ], { timeout: 10000 }, (err2) => {
          if (!err2) return callback(null, outputPath);
          _createRawPng(outputPath, callback);
        });
      });
    } else {
      _createRawPng(outputPath, callback);
    }
  });
}

// Pure Node.js PNG: 1920x1080 solid #1a1d23 using zlib
function _createRawPng(outputPath, callback) {
  const W = 1920, H = 1080;
  const R = 0x1a, G = 0x1d, B = 0x23;
  const rowSize = 1 + W * 3;
  const rawData = Buffer.alloc(H * rowSize);
  for (let y = 0; y < H; y++) {
    const rs = y * rowSize;
    rawData[rs] = 0;
    for (let x = 0; x < W; x++) {
      rawData[rs + 1 + x * 3] = R;
      rawData[rs + 1 + x * 3 + 1] = G;
      rawData[rs + 1 + x * 3 + 2] = B;
    }
  }
  zlib.deflate(rawData, (err, compressed) => {
    if (err) return callback(err);
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(W, 0); ihdrData.writeUInt32BE(H, 4);
    ihdrData[8] = 8; ihdrData[9] = 2;
    function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function chunk(type, data) {
      const tb = Buffer.from(type, 'ascii');
      const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length, 0);
      const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
      return Buffer.concat([lb, tb, data, cb]);
    }
    const png = Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
    fs.writeFile(outputPath, png, (werr) => callback(werr, outputPath));
  });
}

// ── Flux local (AUTOMATIC1111 / sd-webui API) ────────────────────────────────

function _generateFluxLocal(description, endpointUrl, outputPath, callback) {
  const body = JSON.stringify({
    prompt: description,
    negative_prompt: 'blurry, low quality, watermark, text overlay',
    width: 1920,
    height: 1080,
    steps: 20,
    cfg_scale: 7,
    sampler_name: 'DPM++ 2M',
  });
  const url = new URL(endpointUrl || 'http://localhost:7860');
  const apiPath = url.pathname.replace(/\/?$/, '') + '/sdapi/v1/txt2img';
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
        if (!parsed.images || !parsed.images[0]) return callback(new Error('No image in Flux response'));
        const imgBuf = Buffer.from(parsed.images[0], 'base64');
        fs.writeFile(outputPath, imgBuf, (err) => callback(err, outputPath));
      } catch (e) {
        callback(new Error('Flux parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(120000, () => { req.destroy(); callback(new Error('Flux local timeout')); });
  req.write(body);
  req.end();
}

// ── FAL.ai ───────────────────────────────────────────────────────────────────

function _generateFal(description, apiKey, model, outputPath, callback) {
  if (!apiKey) return callback(new Error('FAL.ai API key required'));
  const falModel = model || 'fal-ai/flux/schnell';
  const body = JSON.stringify({
    prompt: description,
    image_size: { width: 1920, height: 1080 },
    num_images: 1,
    output_format: 'png',
  });
  const req = https.request({
    hostname: 'fal.run',
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
        if (parsed.detail) return callback(new Error('FAL error: ' + parsed.detail));
        const imgUrl = parsed.images && parsed.images[0] && parsed.images[0].url;
        if (!imgUrl) return callback(new Error('No image URL in FAL response'));
        _downloadToFile(imgUrl, outputPath, callback);
      } catch (e) {
        callback(new Error('FAL parse error: ' + e.message));
      }
    });
  });
  req.on('error', callback);
  req.setTimeout(120000, () => { req.destroy(); callback(new Error('FAL timeout')); });
  req.write(body);
  req.end();
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

// ── Main entry point ─────────────────────────────────────────────────────────

function generateImage(options, outputPath, callback) {
  const { provider, description, endpointUrl, apiKey, model } = options;
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  switch (provider) {
    case 'flux_local': return _generateFluxLocal(description, endpointUrl, outputPath, callback);
    case 'fal':        return _generateFal(description, apiKey, model, outputPath, callback);
    case 'placeholder':
    default:           return _createPlaceholderPng(description, outputPath, callback);
  }
}

module.exports = { generateImage };
