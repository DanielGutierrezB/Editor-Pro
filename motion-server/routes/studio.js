const express = require('express');
const router = express.Router();
const RemotionManager = require('../lib/remotion-manager');

let studioProcess = null;
let studioUrl = null;

// Sync session before opening studio
router.get('/sync', (req, res) => {
  const sessionDir = req.query.sessionDir;
  if (!sessionDir) return res.status(400).json({ error: 'Missing sessionDir' });

  const manager = new RemotionManager(req.app.locals.renderProject);
  manager.syncFromSession(sessionDir);
  res.json({ success: true, synced: sessionDir });
});

router.get('/start', (req, res) => {
  // Sync session if provided
  const sessionDir = req.query.sessionDir;
  const manager = new RemotionManager(req.app.locals.renderProject);
  if (sessionDir) {
    manager.syncFromSession(sessionDir);
  }

  if (studioUrl) {
    return res.json({ url: studioUrl, status: 'already_running' });
  }

  manager.startStudio((err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    studioUrl = result.url;
    studioProcess = result.pid;
    res.json({ url: result.url, status: 'started', pid: result.pid });
  });
});

router.get('/url', (_req, res) => {
  res.json({
    url: studioUrl || 'http://localhost:3000',
    running: !!studioUrl,
  });
});

router.get('/url/:compositionId', (req, res) => {
  const base = studioUrl || 'http://localhost:3000';
  res.json({
    url: `${base}/?composition=${req.params.compositionId}`,
    running: !!studioUrl,
  });
});

module.exports = router;
