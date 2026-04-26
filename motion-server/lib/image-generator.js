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

// ── ComfyUI (Flux local via node-based workflow) ─────────────────────────────

function _generateComfyUI(description, endpointUrl, outputPath, callback) {
  const baseUrl = endpointUrl || 'http://127.0.0.1:8188';
  const clientId = 'editorpro_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  // Auto-detect model: look for flux schnell variants in ComfyUI checkpoints dir
  _detectFluxModel(baseUrl, (modelName) => {
    _runComfyUIWorkflow(baseUrl, clientId, description, modelName, outputPath, callback);
  });
}

function _detectFluxModel(baseUrl, callback) {
  const url = new URL(baseUrl);
  const lib = url.protocol === 'https:' ? https : http;
  const req = lib.get(`${baseUrl}/object_info/UNETLoader`, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const info = JSON.parse(data);
        const models = info.UNETLoader && info.UNETLoader.input && info.UNETLoader.input.required &&
          info.UNETLoader.input.required.unet_name && info.UNETLoader.input.required.unet_name[0];
        if (Array.isArray(models)) {
          // Prefer flux1-schnell, then any flux model
          const schnell = models.find(m => /flux.*schnell/i.test(m));
          if (schnell) return callback(schnell);
          const anyFlux = models.find(m => /flux/i.test(m));
          if (anyFlux) return callback(anyFlux);
        }
      } catch (_e) {}
      callback('flux1-schnell.safetensors'); // fallback
    });
  });
  req.on('error', () => callback('flux1-schnell.safetensors'));
  req.setTimeout(5000, () => { req.destroy(); callback('flux1-schnell.safetensors'); });
}

function _runComfyUIWorkflow(baseUrl, clientId, description, modelName, outputPath, callback) {
  console.log('[ComfyUI] Using model:', modelName);

  // Flux Schnell workflow — minimal nodes for txt2img
  const workflow = {
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": description,
        "clip": ["11", 0]
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["13", 0],
        "vae": ["10", 0]
      }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": clientId,
        "images": ["8", 0]
      }
    },
    "10": {
      "class_type": "VAELoader",
      "inputs": {
        "vae_name": "ae.safetensors"
      }
    },
    "11": {
      "class_type": "DualCLIPLoader",
      "inputs": {
        "clip_name1": "clip_l.safetensors",
        "clip_name2": "t5xxl_fp16.safetensors",
        "type": "flux"
      }
    },
    "12": {
      "class_type": "UNETLoader",
      "inputs": {
        "unet_name": modelName,
        "weight_dtype": "default"
      }
    },
    "13": {
      "class_type": "KSampler",
      "inputs": {
        "seed": Math.floor(Math.random() * 2147483647),
        "steps": 4,
        "cfg": 1.0,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1.0,
        "model": ["12", 0],
        "positive": ["6", 0],
        "negative": ["33", 0],
        "latent_image": ["27", 0]
      }
    },
    "27": {
      "class_type": "EmptyLatentImage",
      "inputs": {
        "width": 1024,
        "height": 576,
        "batch_size": 1
      }
    },
    "33": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": "",
        "clip": ["11", 0]
      }
    }
  };

  const promptBody = JSON.stringify({
    prompt: workflow,
    client_id: clientId,
  });

  const url = new URL(baseUrl);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  // Step 1: Queue the prompt
  const req = lib.request({
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: '/prompt',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(promptBody) },
  }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          const errMsg = typeof parsed.error === 'object' ? JSON.stringify(parsed.error) : String(parsed.error);
          console.error('[ComfyUI] Prompt error:', errMsg);
          // Include node errors if available
          if (parsed.node_errors) console.error('[ComfyUI] Node errors:', JSON.stringify(parsed.node_errors));
          return callback(new Error('ComfyUI error: ' + errMsg + (parsed.node_errors ? ' | nodes: ' + JSON.stringify(parsed.node_errors) : '')));
        }
        const promptId = parsed.prompt_id;
        if (!promptId) return callback(new Error('No prompt_id from ComfyUI'));
        // Step 2: Poll history until complete
        _pollComfyUI(lib, url, promptId, clientId, outputPath, callback);
      } catch (e) {
        callback(new Error('ComfyUI response parse error: ' + e.message + ' raw: ' + data.substring(0, 300)));
      }
    });
  });
  req.on('error', (e) => callback(new Error('ComfyUI connection error: ' + e.message + '. Is ComfyUI running on ' + baseUrl + '?')));
  req.setTimeout(30000, () => { req.destroy(); callback(new Error('ComfyUI prompt timeout')); });
  req.write(promptBody);
  req.end();
}

function _pollComfyUI(lib, url, promptId, clientId, outputPath, callback) {
  let polls = 0;
  const maxPolls = 120; // 120 × 2s = 4 min
  let called = false;
  function done(err, result) { if (called) return; called = true; callback(err, result); }
  function poll() {
    polls++;
    if (polls > maxPolls) return done(new Error('ComfyUI generation timeout'));
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: '/history/' + promptId,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const history = JSON.parse(data);
          const entry = history[promptId];
          if (!entry) { setTimeout(poll, 2000); return; }
          if (entry.status && entry.status.status_str === 'error') {
            return done(new Error('ComfyUI execution error: ' + JSON.stringify(entry.status)));
          }
          if (entry.outputs) {
            // Find the SaveImage output
            for (const nodeId of Object.keys(entry.outputs)) {
              const output = entry.outputs[nodeId];
              if (output.images && output.images.length > 0) {
                const img = output.images[0];
                // Download the image
                const viewPath = '/view?filename=' + encodeURIComponent(img.filename) +
                  '&subfolder=' + encodeURIComponent(img.subfolder || '') +
                  '&type=' + encodeURIComponent(img.type || 'output');
                const dlReq = lib.request({
                  hostname: url.hostname,
                  port: url.port || 80,
                  path: viewPath,
                  method: 'GET',
                }, (dlRes) => {
                  const chunks = [];
                  dlRes.on('data', (c) => chunks.push(c));
                  dlRes.on('end', () => {
                    const imgBuf = Buffer.concat(chunks);
                    fs.writeFile(outputPath, imgBuf, (err) => done(err, outputPath));
                  });
                });
                dlReq.on('error', (e) => done(new Error('ComfyUI download error: ' + e.message)));
                dlReq.setTimeout(15000, () => { dlReq.destroy(); done(new Error('ComfyUI download timeout')); });
                dlReq.end();
                return;
              }
            }
            done(new Error('ComfyUI: no images in output'));
          } else {
            setTimeout(poll, 2000);
          }
        } catch (e) {
          setTimeout(poll, 2000);
        }
      });
    });
    req.on('error', () => setTimeout(poll, 3000));
    req.setTimeout(10000, () => { req.destroy(); setTimeout(poll, 2000); });
    req.end();
  }
  setTimeout(poll, 1000);
}

// ── Main entry point ─────────────────────────────────────────────────────────

function generateImage(options, outputPath, callback) {
  const { provider, description, endpointUrl, apiKey, model } = options;
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  switch (provider) {
    case 'comfyui':    return _generateComfyUI(description, endpointUrl, outputPath, callback);
    case 'flux_local': return _generateFluxLocal(description, endpointUrl, outputPath, callback);
    case 'fal':        return _generateFal(description, apiKey, model, outputPath, callback);
    case 'placeholder':
    default:           return _createPlaceholderPng(description, outputPath, callback);
  }
}

module.exports = { generateImage };
