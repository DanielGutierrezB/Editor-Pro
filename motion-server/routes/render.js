const express = require('express');
const router = express.Router();
const path = require('path');
const { execSync, execFileSync, execFile } = require('child_process');
const fs = require('fs');
const RemotionManager = require('../lib/remotion-manager');
const RenderQueue = require('../lib/render-queue');

// Singleton render queue for this server
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
        return done();
      }
      // Fallback: try copy-only faststart if re-encode fails
      execFile(
        'ffmpeg',
        ['-y', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', tmp],
        { encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
        function(err2) {
          if (!err2 && fs.existsSync(tmp)) {
            try { fs.unlinkSync(filePath); } catch(_e) {}
            try { fs.renameSync(tmp, filePath); } catch(_e) {}
          }
          try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_e3) {}
          done();
        }
      );
    }
  );
}

// Configure the render queue's render function
// This captures req.app.locals via closure when the first request arrives
let _renderFnConfigured = false;
function _ensureRenderFn(app) {
  if (_renderFnConfigured) return;
  _renderFnConfigured = true;

  renderQueue.setRenderFn(function(job, done) {
    const manager = new RemotionManager(app.locals.renderProject);

    // Sync session before render to ensure Root.tsx is correct
    if (job.sessionDir) manager.syncFromSession(job.sessionDir);

    // If durationFrames override is set (e.g., "Animar" matching timeline clip length),
    // update the composition registration in Root.tsx before rendering
    if (job.durationFrames && job.durationFrames > 0) {
      manager.updateCompositionDuration(job.compositionId, job.durationFrames);
    }

    const tsx = manager.getCompositionTsx(job.compositionId);
    if (!tsx) {
      return done(new Error('Composition ' + job.compositionId + ' not found'));
    }

    manager.render(job.compositionId, function(err, result) {
      if (err) return done(err);

      // Post-process: faststart (async) + probe duration
      var mp4 = result.mp4Path;
      var doFaststart = mp4 && mp4.endsWith('.mp4');

      function finish() {
        var mediaDurationSec = probeVideoDurationSec(mp4);
        done(null, {
          compositionId: result.compositionId,
          mp4Path: mp4,
          mediaDurationSec: mediaDurationSec,
          status: 'rendered',
        });
      }

      if (doFaststart) {
        faststartMp4InPlace(mp4, finish);
      } else {
        finish();
      }
    }, job.outputDir || null);
  });
}

// POST /api/render — enqueue a render job, return jobId immediately
// Optional: durationFrames overrides the composition's registered duration (used by "Animar" to match timeline clip length)
router.post('/', (req, res) => {
  const { compositionId, outputDir, sessionDir, durationFrames } = req.body;

  if (!compositionId) {
    return res.status(400).json({ error: 'Missing compositionId' });
  }

  _ensureRenderFn(req.app);

  // Don't sync/validate here — the render function handles syncFromSession when the job executes.
  // This avoids double-sync which could cause race conditions if compositions change between enqueue and render.
  const job = renderQueue.enqueue({
    compositionId,
    outputDir: outputDir || null,
    sessionDir: sessionDir || null,
    durationFrames: durationFrames ? parseInt(durationFrames, 10) : null,
  });

  res.json({
    jobId: job.id,
    compositionId: compositionId,
    status: job.status,
  });
});

// GET /api/render/status/:jobId — poll job status
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

// Preview: render single frame as PNG (persistent — saved to session/previews/)
router.post('/preview', (req, res) => {
  const { compositionId, sessionDir, frame, outputDir } = req.body;
  if (!compositionId) return res.status(400).json({ error: 'Missing compositionId' });

  const manager = new RemotionManager(req.app.locals.renderProject);
  if (sessionDir) manager.syncFromSession(sessionDir);

  const tsx = manager.getCompositionTsx(compositionId);
  if (!tsx) return res.status(404).json({ error: `Composition ${compositionId} not found` });

  const previewFrame = frame || 0; // frame 0 is fine — staticPreview mode renders everything at full opacity

  // Determine output path: persist to session's previews/ folder if outputDir given
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

  try {
    const npxPath = execSync('which npx', { encoding: 'utf8' }).trim();
    const entryPoint = path.join(req.app.locals.renderProject, 'src', 'index.ts');
    const staticProps = JSON.stringify({staticPreview: true});
    execSync(`"${npxPath}" remotion still "${entryPoint}" ${compositionId} "${outPath}" --frame=${previewFrame} --image-format=png --props='${staticProps}'`, {
      cwd: req.app.locals.renderProject,
      stdio: 'ignore',
      timeout: 30000,
    });

    if (fs.existsSync(outPath)) {
      const imgData = fs.readFileSync(outPath);
      const b64 = 'data:image/png;base64,' + imgData.toString('base64');
      // PNG persists on disk — NOT deleted
      res.json({ success: true, preview: b64, pngPath: outPath, compositionId, frame: previewFrame });
    } else {
      res.status(500).json({ error: 'Preview frame not generated' });
    }
  } catch(e) {
    res.status(500).json({ error: 'Preview error: ' + e.message });
  }
});

module.exports = router;
