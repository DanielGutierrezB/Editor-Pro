const express = require('express');
const router = express.Router();
const RemotionManager = require('../lib/remotion-manager');

let studioProcess = null;
let studioUrl = null;

// Sync session before opening studio
router.get('/sync', (req, res) => {
  const sessionDir = req.query.sessionDir;
  if (!sessionDir) {
    console.error('[studio] /sync — missing sessionDir');
    return res.status(400).json({ error: 'Missing sessionDir' });
  }

  console.log('[studio] Syncing session: ' + sessionDir);
  const manager = new RemotionManager(req.app.locals.renderProject);
  manager.syncFromSession(sessionDir);
  console.log('[studio] Sync complete');
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

  console.log('[studio] Starting Remotion Studio...');
  manager.startStudio((err, result) => {
    if (err) {
      console.error('[studio] Start failed: ' + err.message);
      return res.status(500).json({ error: err.message });
    }
    studioUrl = result.url;
    studioProcess = result.pid;
    console.log('[studio] Started at ' + result.url + ' (pid=' + result.pid + ')');
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
