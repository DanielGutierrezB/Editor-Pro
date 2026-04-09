const express = require('express');
const router = express.Router();
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const RemotionManager = require('../lib/remotion-manager');

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
    res.json({
      compositionId: result.compositionId,
      mp4Path: result.mp4Path,
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
