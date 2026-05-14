const express = require('express');
const router = express.Router();
const path = require('path');
const { execSync, execFileSync, execFile } = require('child_process'); // execFileSync used by probeVideoDurationSec
const fs = require('fs');
const RemotionManager = require('../lib/remotion-manager');
const RenderQueue = require('../lib/render-queue');

// Singleton render queue — processes ONE job at a time (video or preview).
// This guarantees no two Remotion processes compete for Root.tsx / compositions.
const renderQueue = new RenderQueue();

/**
 * Duración útil (s): el mínimo entre contenedor y pista de vídeo, para no alargar el clip en timeline por metadata inflada.
 */
function probeVideoDurationSec(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const candidates = [];
  try {
    const outFmt = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 }
    );
    const d0 = parseFloat(String(outFmt).trim());
    if (Number.isFinite(d0) && d0 > 0.05) candidates.push(d0);
  } catch (_e) {}
  try {
    const outSt = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 }
    );
    const d1 = parseFloat(String(outSt).trim());
    if (Number.isFinite(d1) && d1 > 0.05) candidates.push(d1);
  } catch (_e) {}
  if (candidates.length === 0) return null;
  return Math.min.apply(null, candidates);
}

/** Reescribe el mp4 con moov al inicio (async, no bloquea event loop); mejora lectura en Premiere. */
function faststartMp4InPlace(filePath, callback) {
  if (!filePath || !fs.existsSync(filePath)) return callback ? callback() : undefined;
  const tmp = filePath + '.__fst.mp4';
  const done = callback || function() {};

  // Re-encode with all-intra keyframes (-g 1), no B-frames (-bf 0), 
  // high profile, and faststart. This prevents Premiere's hardware decoder
  // from choking on long GOP decode chains.
  execFile(
    'ffmpeg',
    ['-y', '-i', filePath, 
     '-c:v', 'libx264', '-crf', '15', '-preset', 'fast',
     '-g', '1', '-bf', '0',
     '-profile:v', 'high', '-level', '4.2',
     '-pix_fmt', 'yuv420p',
     '-movflags', '+faststart',
     '-an', tmp],
    { encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
    function(err) {
      if (!err && fs.existsSync(tmp)) {
        try { fs.unlinkSync(filePath); } catch(_e) {}
        try { fs.renameSync(tmp, filePath); } catch(_e) {}
        console.log('[render/faststart] Re-encoded with all-intra keyframes: ' + path.basename(filePath));
        return done();
      }
      // Fallback: try copy-only faststart if re-encode fails
      console.warn('[render/faststart] Re-encode failed, trying copy-only faststart...');
      execFile(
        'ffmpeg',
        ['-y', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', tmp],
        { encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
        function(err2) {
          if (!err2 && fs.existsSync(tmp)) {
            try { fs.unlinkSync(filePath); } catch(_e) {}
            try { fs.renameSync(tmp, filePath); } catch(_e) {}
            console.log('[render/faststart] Copy-only faststart applied: ' + path.basename(filePath));
          } else {
            console.warn('[render/faststart] Both faststart methods failed for: ' + path.basename(filePath));
          }
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_e3) {}
          done();
        }
      );
    }
  );
}

// Configure the render queue's render function
// Handles both video renders (type=render) and preview stills (type=preview).
let _renderFnConfigured = false;
function _ensureRenderFn(app) {
  if (_renderFnConfigured) return;
  _renderFnConfigured = true;

  renderQueue.setRenderFn(function(job, done) {
    const renderStart = Date.now();
    const manager = new RemotionManager(app.locals.renderProject);

    // Sync session before render to ensure Root.tsx has the right compositions
    if (job.sessionDir) {
      console.log('[render] Syncing session: ' + job.sessionDir);
      manager.syncFromSession(job.sessionDir);
    }

    // ── Preview still (PNG) ──────────────────────────────────────
    if (job.type === 'preview') {
      console.log('[render/preview] START compositionId=' + job.compositionId + ' frame=' + (job.frame || 0));
      const tsx = manager.getCompositionTsx(job.compositionId);
      if (!tsx) {
        console.error('[render/preview] Composition not found: ' + job.compositionId);
        manager.cleanCompositions();
        return done(new Error('Composition ' + job.compositionId + ' not found'));
      }

      console.log('[render/preview] Rendering still via Remotion...');
      manager.renderStill(job.compositionId, job.outPath, job.frame, function(err, result) {
        // Clean ephemeral compositions — queue is serial, safe to clean now
        manager.cleanCompositions();

        if (err) {
          console.error('[render/preview] Remotion still failed after ' + (Date.now() - renderStart) + 'ms: ' + err.message);
          return done(err);
        }

        // Read PNG and encode as base64
        try {
          var imgData = fs.readFileSync(result.pngPath);
          var b64 = 'data:image/png;base64,' + imgData.toString('base64');
          console.log('[render/preview] OK compositionId=' + result.compositionId + ' pngSize=' + imgData.length + ' renderMs=' + (Date.now() - renderStart));
          done(null, {
            compositionId: result.compositionId,
            pngPath: result.pngPath,
            preview: b64,
            frame: job.frame || 0,
            status: 'preview',
          });
        } catch(readErr) {
          console.error('[render/preview] Failed to read PNG: ' + readErr.message);
          done(new Error('Failed to read preview PNG: ' + readErr.message));
        }
      });
      return;
    }

    // ── Video render (MP4) ───────────────────────────────────────
    // If durationFrames override is set (e.g., "Animar" matching timeline clip length),
    // update the composition registration in Root.tsx before rendering
    if (job.durationFrames && job.durationFrames > 0) {
      console.log('[render/video] Duration override: ' + job.durationFrames + ' frames for ' + job.compositionId);
      manager.updateCompositionDuration(job.compositionId, job.durationFrames);
    }

    console.log('[render/video] START compositionId=' + job.compositionId);
    const tsx = manager.getCompositionTsx(job.compositionId);
    if (!tsx) {
      console.error('[render/video] Composition not found: ' + job.compositionId);
      manager.cleanCompositions();
      return done(new Error('Composition ' + job.compositionId + ' not found'));
    }

    var renderOpts = {};
    if (job.bgMode) renderOpts.bgMode = job.bgMode;
    console.log('[render/video] Rendering via Remotion (ProRes' + (job.bgMode === 'alpha' ? ' 4444 alpha' : '') + ')...');
    manager.render(job.compositionId, function(err, result) {
      if (err) {
        console.error('[render/video] Remotion render failed after ' + (Date.now() - renderStart) + 'ms: ' + String(err.message).substring(0, 300));
        manager.cleanCompositions();
        return done(err);
      }

      // Post-process: faststart (async) + probe duration
      var mp4 = result.mp4Path;
      var doFaststart = mp4 && mp4.endsWith('.mp4');
      console.log('[render/video] Remotion done in ' + (Date.now() - renderStart) + 'ms — output: ' + mp4);

      function finish() {
        var mediaDurationSec = probeVideoDurationSec(mp4);
        // Session is the single source of truth — clean ephemeral compositions dir
        manager.cleanCompositions();
        var totalMs = Date.now() - renderStart;
        console.log('[render/video] OK compositionId=' + result.compositionId + ' duration=' + (mediaDurationSec ? mediaDurationSec.toFixed(2) + 's' : '?') + ' totalMs=' + totalMs);
        done(null, {
          compositionId: result.compositionId,
          mp4Path: mp4,
          mediaDurationSec: mediaDurationSec,
          status: 'rendered',
        });
      }

      if (doFaststart) {
        console.log('[render/video] Running ffmpeg faststart...');
        faststartMp4InPlace(mp4, finish);
      } else {
        finish();
      }
    }, job.outputDir || null, renderOpts);
  });
}

// POST /api/render — enqueue a video render job, return jobId immediately
// Optional: durationFrames overrides the composition's registered duration (used by "Animar" to match timeline clip length)
router.post('/', (req, res) => {
  const { compositionId, outputDir, sessionDir, durationFrames, bgMode } = req.body;

  if (!compositionId) {
    console.error('[render] POST / — missing compositionId');
    return res.status(400).json({ error: 'Missing compositionId' });
  }

  _ensureRenderFn(req.app);

  console.log('[render] Enqueue video render: compositionId=' + compositionId + (durationFrames ? ' durationFrames=' + durationFrames : ''));
  // Don't sync/validate here — the render function handles syncFromSession when the job executes.
  // This avoids double-sync which could cause race conditions if compositions change between enqueue and render.
  const job = renderQueue.enqueue({
    type: 'render',
    compositionId,
    outputDir: outputDir || null,
    sessionDir: sessionDir || null,
    durationFrames: durationFrames ? parseInt(durationFrames, 10) : null,
    bgMode: bgMode || null,
  });

  console.log('[render] Enqueued jobId=' + job.id + ' status=' + job.status);
  res.json({
    jobId: job.id,
    compositionId: compositionId,
    status: job.status,
  });
});

// GET /api/render/status/:jobId — poll job status (works for both video and preview jobs)
router.get('/status/:jobId', (req, res) => {
  const job = renderQueue.getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found: ' + req.params.jobId });
  }

  const response = {
    jobId: job.id,
    compositionId: job.compositionId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };

  if (job.status === 'complete' && job.result) {
    response.result = job.result;
  }
  if (job.status === 'error' && job.error) {
    response.error = job.error;
  }

  res.json(response);
});

// Preview: enqueue a still render job (goes through the same serial queue as video renders).
// The client polls /api/render/status/:jobId for completion — same as video renders.
// This eliminates Root.tsx race conditions when CONCURRENCY > 1 on the client.
router.post('/preview', (req, res) => {
  const { compositionId, sessionDir, frame, outputDir } = req.body;
  if (!compositionId) {
    console.error('[render] POST /preview — missing compositionId');
    return res.status(400).json({ error: 'Missing compositionId' });
  }

  console.log('[render] Enqueue preview: compositionId=' + compositionId + ' frame=' + (frame || 0));
  _ensureRenderFn(req.app);

  // Determine output path for the PNG
  let previewDir;
  if (outputDir) {
    previewDir = path.join(outputDir, 'previews');
  } else if (sessionDir) {
    previewDir = path.join(sessionDir, 'previews');
  } else {
    previewDir = path.join(req.app.locals.outputDir, 'previews');
  }
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
  const outPath = path.join(previewDir, `${compositionId}.png`);

  const previewFrame = frame || 0;

  // Enqueue as a preview job — processed serially by the same queue as video renders
  const job = renderQueue.enqueue({
    type: 'preview',
    compositionId,
    sessionDir: sessionDir || null,
    outputDir: outputDir || null,
    outPath: outPath,
    frame: previewFrame,
  });

  console.log('[render] Enqueued preview jobId=' + job.id + ' status=' + job.status);
  // Return jobId immediately — client polls /api/render/status/:jobId
  res.json({
    jobId: job.id,
    compositionId: compositionId,
    status: job.status,
  });
});

module.exports = router;
