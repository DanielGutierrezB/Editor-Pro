'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');

const { sendLLM } = require('../lib/llm');
const { getAnalysisSystemPrompt, buildAnalysisPrompt } = require('../lib/broll-prompts');
const { generateImage } = require('../lib/image-generator');
const { generateVideo } = require('../lib/video-generator');

// In-memory job queue (similar to render-queue but simpler — B-roll jobs are fast enough)
const _jobs = {};
let _jobSeq = 0;

function _newJobId() { return 'br_' + Date.now() + '_' + (++_jobSeq); }

function _setJob(id, data) { _jobs[id] = Object.assign({ id }, data); return _jobs[id]; }

// ── POST /api/broll/analyze ───────────────────────────────────────────────────
// Body: { transcript, provider, model, apiKey }
// Returns: { proposals: [{ startTime, endTime, description, rationale }] }

router.post('/analyze', (req, res) => {
  const { transcript, provider, model, apiKey } = req.body;
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'transcript is required' });
  }

  const systemMsg = getAnalysisSystemPrompt();
  const userMsg = buildAnalysisPrompt(transcript);

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawText) => {
    if (err) return res.status(500).json({ error: 'LLM error: ' + err.message });

    try {
      let jsonStr = rawText.trim();
      // Extract JSON array from markdown code blocks if present
      const blockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (blockMatch) jsonStr = blockMatch[1].trim();
      // Extract array bounds
      const start = jsonStr.indexOf('[');
      const end = jsonStr.lastIndexOf(']');
      if (start !== -1 && end !== -1) jsonStr = jsonStr.substring(start, end + 1);

      const proposals = JSON.parse(jsonStr);
      if (!Array.isArray(proposals)) throw new Error('Expected JSON array');

      // Validate and normalize each proposal
      const validated = proposals
        .filter((p) => p && p.startTime && p.endTime && p.description)
        .map((p, i) => ({
          id: 'broll_' + Date.now() + '_' + i,
          startTime: p.startTime,
          endTime: p.endTime,
          description: String(p.description).trim(),
          rationale: String(p.rationale || '').trim(),
        }));

      res.json({ proposals: validated });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse proposals: ' + e.message, raw: rawText.substring(0, 500) });
    }
  });
});

// ── POST /api/broll/generate-image ───────────────────────────────────────────
// Body: { proposalId, description, imageProvider, endpointUrl, apiKey, model, outputDir }
// Returns: { jobId } — poll /api/broll/status/:jobId

router.post('/generate-image', (req, res) => {
  const {
    proposalId, description, imageProvider = 'placeholder',
    endpointUrl, apiKey, model, outputDir, clipName,
    referenceImagePath, denoise,
  } = req.body;

  if (!description) return res.status(400).json({ error: 'description is required' });

  // Validate reference image if provided
  if (referenceImagePath && !fs.existsSync(referenceImagePath)) {
    return res.status(400).json({ error: 'referenceImagePath does not exist: ' + referenceImagePath });
  }

  const sessionDir = outputDir || path.join(os.tmpdir(), 'editorpro-broll');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  // Use readable clipName if provided, fallback to proposalId
  const fileName = clipName
    ? clipName.replace(/[^a-z0-9_-]/gi, '_')
    : (proposalId || Date.now()).toString().replace(/[^a-z0-9_-]/gi, '_');
  // Extension may be corrected by image-generator after download (e.g. FAL returns .jpg)
  // Use a generic extension; the actual file will have the correct one
  const outputPath = path.join(sessionDir, fileName + '.png');

  const jobId = _newJobId();
  _setJob(jobId, { type: 'image', status: 'running', proposalId, outputPath,
    isImg2Img: !!referenceImagePath, startTime: Date.now() });

  generateImage(
    { provider: imageProvider, description, endpointUrl, apiKey, model,
      referenceImagePath: referenceImagePath || undefined,
      denoise: denoise || undefined },
    outputPath,
    (err, filePath) => {
      if (err) {
        _jobs[jobId].status = 'error';
        _jobs[jobId].error = err.message;
      } else {
        _jobs[jobId].status = 'complete';
        _jobs[jobId].filePath = filePath;
        console.log('[BRoll] Image done:', filePath);
        // Clean up stale .png if extension was corrected to .jpg/.webp
        if (filePath !== outputPath && fs.existsSync(outputPath)) {
          try { fs.unlinkSync(outputPath); } catch (_e) {}
        }
        // Generate base64 thumbnail (for UI preview)
        try {
          const buf = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
          _jobs[jobId].base64 = 'data:' + mime + ';base64,' + buf.toString('base64');
        } catch (_e) {}
      }
    }
  );

  res.json({ jobId });
});

// ── POST /api/broll/animate ───────────────────────────────────────────────────
// Body: { proposalId, imagePath, durationSecs, prompt, videoProvider, endpointUrl, apiKey, outputDir }
// Returns: { jobId } — poll /api/broll/status/:jobId

router.post('/animate', (req, res) => {
  const {
    proposalId, imagePath, durationSecs = 5,
    prompt, videoProvider = 'placeholder',
    endpointUrl, apiKey, model, outputDir,
  } = req.body;

  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(400).json({ error: 'imagePath is required and must exist' });
  }

  const sessionDir = outputDir || path.dirname(imagePath);
  const safeId = (proposalId || Date.now()).toString().replace(/[^a-z0-9_-]/gi, '_');
  const outputPath = path.join(sessionDir, safeId + '_v' + Date.now() + '.mp4');

  const jobId = _newJobId();
  _setJob(jobId, { type: 'video', status: 'running', proposalId, outputPath, startTime: Date.now() });

  generateVideo(
    { provider: videoProvider, imagePath, durationSecs, prompt, endpointUrl, apiKey, model },
    outputPath,
    (err, filePath) => {
      if (err) {
        _jobs[jobId].status = 'error';
        _jobs[jobId].error = err.message;
      } else {
        _jobs[jobId].status = 'complete';
        _jobs[jobId].filePath = filePath;
      }
    }
  );

  res.json({ jobId });
});

// ── GET /api/broll/status/:jobId ─────────────────────────────────────────────

router.get('/status/:jobId', (req, res) => {
  const job = _jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found: ' + req.params.jobId });
  const response = Object.assign({}, job);
  if (job.status === 'running' && job.startTime) response.elapsedMs = Date.now() - job.startTime;
  res.json(response);
});

// ── GET /api/broll/comfyui-debug?url=... ──────────────────────────────────────
// Returns available node types to debug workflow validation errors

router.get('/comfyui-debug', (req, res) => {
  const comfyUrl = req.query.url || 'http://localhost:8188';
  const http2 = comfyUrl.startsWith('https') ? require('https') : require('http');
  
  const nodesToCheck = ['CLIPTextEncode', 'VAEDecode', 'SaveImage', 'VAELoader', 
    'DualCLIPLoader', 'UNETLoader', 'KSampler', 'EmptyLatentImage', 'EmptySD3LatentImage'];
  
  http2.get(comfyUrl + '/object_info', (checkRes) => {
    let data = '';
    checkRes.on('data', (c) => { data += c; });
    checkRes.on('end', () => {
      try {
        const allNodes = JSON.parse(data);
        const result = {};
        nodesToCheck.forEach(n => { result[n] = !!allNodes[n]; });
        // Also check what checkpoint models are available
        if (allNodes.UNETLoader && allNodes.UNETLoader.input && allNodes.UNETLoader.input.required) {
          result._unet_models = allNodes.UNETLoader.input.required.unet_name ? allNodes.UNETLoader.input.required.unet_name[0] : [];
        }
        if (allNodes.VAELoader && allNodes.VAELoader.input && allNodes.VAELoader.input.required) {
          result._vae_models = allNodes.VAELoader.input.required.vae_name ? allNodes.VAELoader.input.required.vae_name[0] : [];
        }
        if (allNodes.DualCLIPLoader && allNodes.DualCLIPLoader.input && allNodes.DualCLIPLoader.input.required) {
          result._clip_models = allNodes.DualCLIPLoader.input.required.clip_name1 ? allNodes.DualCLIPLoader.input.required.clip_name1[0] : [];
          result._clip_types = allNodes.DualCLIPLoader.input.required.type ? allNodes.DualCLIPLoader.input.required.type[0] : [];
        }
        res.json(result);
      } catch (e) {
        res.json({ error: 'parse error: ' + e.message });
      }
    });
  }).on('error', (e) => res.json({ error: e.message }));
});

// ── GET /api/broll/check-comfyui?url=... ─────────────────────────────────────
// Proxy health check: panel can't connect to ComfyUI directly from CEP,
// so motion-server checks on its behalf.

router.get('/check-comfyui', (req, res) => {
  const comfyUrl = req.query.url || 'http://localhost:8188';
  const http2 = comfyUrl.startsWith('https') ? require('https') : require('http');
  const checkReq = http2.get(comfyUrl + '/system_stats', (checkRes) => {
    let data = '';
    checkRes.on('data', (c) => { data += c; });
    checkRes.on('end', () => {
      try {
        const stats = JSON.parse(data);
        const device = stats.devices && stats.devices[0] ? stats.devices[0].name : 'unknown';
        const vram = stats.devices && stats.devices[0] ? Math.round(stats.devices[0].vram_total / 1024 / 1024) + 'MB' : '?';
        res.json({ ok: true, device, vram });
      } catch (e) {
        res.json({ ok: false, error: 'parse error' });
      }
    });
  });
  checkReq.on('error', (e) => res.json({ ok: false, error: 'no conecta: ' + e.message }));
  checkReq.setTimeout(5000, () => { checkReq.destroy(); res.json({ ok: false, error: 'timeout' }); });
});

// ── GET /api/broll/fal-models?category=text-to-image ─────────────────────────
// Proxy FAL.ai model catalog — CEP panel can't call external APIs directly.
// category: 'text-to-image' or 'image-to-video'

const _falModelsCache = {};
const FAL_CACHE_TTL = 10 * 60 * 1000; // 10 min

// Fetches all pages from FAL.ai model catalog for a given category.
// Calls back with (err, modelsArray) where each model is { id, name, description }.
function _fetchAllFalModels(category, callback) {
  const https2 = require('https');
  const allModels = [];

  function fetchPage(cursor) {
    let apiUrl = '/v1/models?category=' + encodeURIComponent(category) + '&status=active&limit=100';
    if (cursor) apiUrl += '&cursor=' + encodeURIComponent(cursor);

    const apiReq = https2.request({
      hostname: 'api.fal.ai',
      path: apiUrl,
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', (c) => { data += c; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const pageModels = (parsed.models || []).map((m) => ({
            id: m.endpoint_id,
            name: (m.metadata && m.metadata.display_name) || m.endpoint_id,
            description: (m.metadata && m.metadata.description) || '',
          }));
          pageModels.forEach((m) => allModels.push(m));

          if (parsed.has_more && parsed.next_cursor) {
            fetchPage(parsed.next_cursor);
          } else {
            callback(null, allModels);
          }
        } catch (e) {
          callback(e, allModels);
        }
      });
    });
    apiReq.on('error', (e) => callback(e, allModels));
    apiReq.setTimeout(15000, () => { apiReq.destroy(); callback(new Error('timeout'), allModels); });
    apiReq.end();
  }

  fetchPage(null);
}

router.get('/fal-models', (req, res) => {
  const category = req.query.category || 'text-to-image';
  const now = Date.now();

  // Serve from cache if fresh
  if (_falModelsCache[category] && (now - _falModelsCache[category].ts) < FAL_CACHE_TTL) {
    return res.json(_falModelsCache[category].data);
  }

  _fetchAllFalModels(category, (err, models) => {
    if (err && models.length === 0) {
      return res.json({ models: [], error: err.message });
    }
    const result = { models, category };
    _falModelsCache[category] = { ts: now, data: result };
    res.json(result);
  });
});

module.exports = router;
