const express = require('express');
const router = express.Router();
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const RemotionManager = require('../lib/remotion-manager');

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

/** Reescribe el mp4 con moov al inicio (sin re-codificar); mejora lectura en Premiere. */
function faststartMp4InPlace(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const tmp = filePath + '.__fst.mp4';
  try {
    // Re-encode with all-intra keyframes (-g 1), no B-frames (-bf 0), 
    // high profile, and faststart. This prevents Premiere's hardware decoder
    // from choking on long GOP decode chains.
    execFileSync(
      'ffmpeg',
      ['-y', '-i', filePath, 
       '-c:v', 'libx264', '-crf', '15', '-preset', 'fast',
       '-g', '1', '-bf', '0',
       '-profile:v', 'high', '-level', '4.2',
       '-pix_fmt', 'yuv420p',
       '-movflags', '+faststart',
       '-an', tmp],
      { encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
    );
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(filePath);
      fs.renameSync(tmp, filePath);
    }
  } catch (_e) {
    // Fallback: try copy-only faststart if re-encode fails
    try {
      execFileSync(
        'ffmpeg',
        ['-y', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', tmp],
        { encoding: 'utf8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
      );
      if (fs.existsSync(tmp)) {
        fs.unlinkSync(filePath);
        fs.renameSync(tmp, filePath);
      }
    } catch (_e2) {}
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_e3) {}
  }
}

router.post('/', (req, res) => {
  const { compositionId, outputDir, sessionDir } = req.body;

  if (!compositionId) {
    return res.status(400).json({ error: 'Missing compositionId' });
  }

  const manager = new RemotionManager(req.app.locals.renderProject);

  // Sync session before render to ensure Root.tsx is correct
  if (sessionDir) manager.syncFromSession(sessionDir);

  const tsx = manager.getCompositionTsx(compositionId);
  if (!tsx) {
    return res.status(404).json({ error: `Composition ${compositionId} not found` });
  }

  manager.render(compositionId, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Render error: ' + err.message });
    }
    try {
      if (result.mp4Path && result.mp4Path.endsWith(".mp4")) faststartMp4InPlace(result.mp4Path);
    } catch (_e) {}
    const mediaDurationSec = probeVideoDurationSec(result.mp4Path);
    res.json({
      compositionId: result.compositionId,
      mp4Path: result.mp4Path,
      mediaDurationSec: mediaDurationSec,
      status: 'rendered',
    });
  }, outputDir || null);
});

// Preview: render single frame as PNG
router.post('/preview', (req, res) => {
  const { compositionId, sessionDir, frame } = req.body;
  if (!compositionId) return res.status(400).json({ error: 'Missing compositionId' });

  const manager = new RemotionManager(req.app.locals.renderProject);
  if (sessionDir) manager.syncFromSession(sessionDir);

  const tsx = manager.getCompositionTsx(compositionId);
  if (!tsx) return res.status(404).json({ error: `Composition ${compositionId} not found` });

  const previewFrame = frame || 30;
  const outPath = path.join(req.app.locals.outputDir, `preview_${compositionId}.png`);

  try {
    const npxPath = execSync('which npx', { encoding: 'utf8' }).trim();
    const entryPoint = path.join(req.app.locals.renderProject, 'src', 'index.ts');
    execSync(`"${npxPath}" remotion still "${entryPoint}" ${compositionId} "${outPath}" --frame=${previewFrame} --image-format=png`, {
      cwd: req.app.locals.renderProject,
      stdio: 'ignore',
      timeout: 30000,
    });

    if (fs.existsSync(outPath)) {
      const imgData = fs.readFileSync(outPath);
      const b64 = 'data:image/png;base64,' + imgData.toString('base64');
      fs.unlinkSync(outPath);
      res.json({ success: true, preview: b64, compositionId, frame: previewFrame });
    } else {
      res.status(500).json({ error: 'Preview frame not generated' });
    }
  } catch(e) {
    res.status(500).json({ error: 'Preview error: ' + e.message });
  }
});

module.exports = router;
