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
    endpointUrl, apiKey, model, outputDir,
  } = req.body;

  if (!description) return res.status(400).json({ error: 'description is required' });

  const sessionDir = outputDir || path.join(os.tmpdir(), 'editorpro-broll');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

  const safeId = (proposalId || Date.now()).toString().replace(/[^a-z0-9_-]/gi, '_');
  const outputPath = path.join(sessionDir, safeId + '.png');

  const jobId = _newJobId();
  _setJob(jobId, { type: 'image', status: 'running', proposalId, outputPath });

  generateImage(
    { provider: imageProvider, description, endpointUrl, apiKey, model },
    outputPath,
    (err, filePath) => {
      if (err) {
        _jobs[jobId].status = 'error';
        _jobs[jobId].error = err.message;
      } else {
        _jobs[jobId].status = 'complete';
        _jobs[jobId].filePath = filePath;
        // Generate base64 thumbnail (for UI preview)
        try {
          const buf = fs.readFileSync(filePath);
          _jobs[jobId].base64 = 'data:image/png;base64,' + buf.toString('base64');
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
    endpointUrl, apiKey, outputDir,
  } = req.body;

  if (!imagePath || !fs.existsSync(imagePath)) {
    return res.status(400).json({ error: 'imagePath is required and must exist' });
  }

  const sessionDir = outputDir || path.dirname(imagePath);
  const safeId = (proposalId || Date.now()).toString().replace(/[^a-z0-9_-]/gi, '_');
  const outputPath = path.join(sessionDir, safeId + '_v' + Date.now() + '.mp4');

  const jobId = _newJobId();
  _setJob(jobId, { type: 'video', status: 'running', proposalId, outputPath });

  generateVideo(
    { provider: videoProvider, imagePath, durationSecs, prompt, endpointUrl, apiKey },
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
  res.json(job);
});

module.exports = router;
