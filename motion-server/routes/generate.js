const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getGenerationPrompt } = require('../lib/prompts');

router.post('/', (req, res) => {
  const {
    proposal,
    transcriptSegment,
    provider,
    model,
    apiKey,
    sessionDir,
    brandfetchKey,
  } = req.body;

  if (!proposal || !transcriptSegment) {
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const manager = new RemotionManager(req.app.locals.renderProject);

  const compositionId = (proposal.id + '-v' + (proposal.version || 1)).replace(/_/g, '-');
  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  // Add 6 buffer frames to prevent Premiere framerate mismatch seek errors
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  const { systemMsg, userMsg } = getGenerationPrompt({
    transcriptSegment,
    type: proposal.type,
    description: proposal.description,
    durationFrames,
    compositionId,
    brandfetchKey: brandfetchKey || '',
  });

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    if (err) {
      return res.status(500).json({ error: 'LLM error: ' + err.message });
    }

    let tsxCode = rawCode;
    const codeMatch = rawCode.match(/```(?:tsx?|jsx?|react)?\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      tsxCode = codeMatch[1].trim();
    }

    try {
      // Sync session before writing (ensures clean state)
      if (sessionDir) manager.syncFromSession(sessionDir);
      const result = manager.writeComposition(compositionId, tsxCode, durationFrames);

      // Check if writeComposition returned a syntax error object
      if (result && result.syntaxError) {
        return res.status(500).json({
          error: 'Syntax error in generated TSX: ' + (result.errors || []).join('; '),
          compositionId,
        });
      }

      // Save back to session folder
      if (sessionDir) manager.saveToSession(compositionId, sessionDir);
      res.json({
        compositionId,
        tsxPath: typeof result === 'string' ? result : (result && result.filePath) || '',
        durationFrames,
        status: 'generated',
      });
    } catch (writeErr) {
      res.status(500).json({ error: 'Write error: ' + writeErr.message });
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Free-form generation — always uses free-form TSX, visualDescription is optional
// context that guides the art direction when provided.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/template', (req, res) => {
  const { proposal, transcriptSegment, provider, model, apiKey, sessionDir, visualDescription } = req.body;
  console.log('[generate/template] provider=' + provider + ' model=' + model + (visualDescription ? ' [guided by visualDescription]' : ' [free-form]'));

  if (!proposal || !transcriptSegment) {
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const compositionId = (proposal.id + '-v' + (proposal.version || 1)).replace(/_/g, '-');
  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  const { systemMsg, userMsg } = getGenerationPrompt({
    transcriptSegment,
    type: proposal.type,
    description: proposal.description,
    durationFrames,
    compositionId,
    brandfetchKey: '',
    visualDescription: visualDescription || null,
  });

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    if (err) return res.status(500).json({ error: 'LLM error: ' + err.message });

    if (!rawCode || rawCode.trim().length === 0) {
      return res.status(500).json({ error: 'LLM returned empty response — check API key and model' });
    }

    let tsxCode = rawCode;
    const codeMatch = rawCode.match(/```(?:tsx?|jsx?|react)?\s*\n([\s\S]*?)```/);
    if (codeMatch) tsxCode = codeMatch[1].trim();

    try {
      const manager = new RemotionManager(req.app.locals.renderProject);
      if (sessionDir) manager.syncFromSession(sessionDir);
      const result = manager.writeComposition(compositionId, tsxCode, durationFrames);

      if (result && result.syntaxError) {
        return res.status(500).json({
          error: 'Syntax error in generated TSX: ' + (result.errors || []).join('; '),
          compositionId,
        });
      }

      if (sessionDir) manager.saveToSession(compositionId, sessionDir);

      res.json({
        compositionId,
        tsxPath: typeof result === 'string' ? result : (result && result.filePath) || '',
        durationFrames,
        status: 'generated',
        method: 'free-form',
      });
    } catch (writeErr) {
      res.status(500).json({ error: 'Write error: ' + writeErr.message });
    }
  });
});

module.exports = router;
