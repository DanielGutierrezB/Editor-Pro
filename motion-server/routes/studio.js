const express = require('express');
const router = express.Router();
const RemotionManager = require('../lib/remotion-manager');
const renderRoute = require('./render');

let studioProcess = null;
let studioUrl = null;

/**
 * syncFromSession wipes and rewrites the shared compositions dir / Root.tsx.
 * The render queue processes jobs one at a time and syncs right before each
 * render — if we also synced here while a render is in flight, we could
 * delete the very .tsx file the Remotion child process is bundling.
 * Renders are normally quick, so a short retry-after response is enough
 * instead of adding a second queue just for this rare manual action.
 */
function _isRenderInFlight() {
  return !!(renderRoute.queue && renderRoute.queue.currentJobId);
}

// Sync session before opening studio
router.get('/sync', (req, res) => {
  const sessionDir = req.query.sessionDir;
  if (!sessionDir) {
    console.error('[studio] /sync — missing sessionDir');
    return res.status(400).json({ error: 'Missing sessionDir' });
  }
  if (_isRenderInFlight()) {
    return res.status(409).json({ error: 'A render is in progress — try again in a moment.' });
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
    if (_isRenderInFlight()) {
      return res.status(409).json({ error: 'A render is in progress — try again in a moment.' });
    }
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
