const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getGenerationPrompt } = require('../lib/prompts');
const TemplateManager = require('../lib/template-manager');
const { getTemplateFillingPrompt } = require('../lib/template-prompt');

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
// Template-based generation — AI fills content values only, template handles layout
// ──────────────────────────────────────────────────────────────────────────────
router.post('/template', (req, res) => {
  const { proposal, transcriptSegment, provider, model, apiKey, sessionDir } = req.body;

  if (!proposal || !transcriptSegment) {
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const templateManager = new TemplateManager();
  const compositionId = (proposal.id + '-v' + (proposal.version || 1)).replace(/_/g, '-');
  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  const { systemMsg, userMsg } = getTemplateFillingPrompt(
    proposal.type, transcriptSegment, proposal.description, durationFrames
  );

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawResponse) => {
    if (err) return res.status(500).json({ error: 'LLM error: ' + err.message });

    try {
      // Parse JSON from response (strip markdown if present)
      let jsonStr = rawResponse.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      const contentValues = JSON.parse(jsonStr);

      // Fill template with content values
      const tsxCode = templateManager.fillTemplate(
        proposal.type, contentValues, compositionId, durationFrames, proposal.startTime, transcriptSegment
      );

      // Write and register composition
      const manager = new RemotionManager(req.app.locals.renderProject);
      if (sessionDir) manager.syncFromSession(sessionDir);
      const result = manager.writeComposition(compositionId, tsxCode, durationFrames);

      if (result && result.syntaxError) {
        return res.status(500).json({
          error: 'Template syntax error: ' + (result.errors || []).join('; '),
          compositionId,
        });
      }

      if (sessionDir) manager.saveToSession(compositionId, sessionDir);

      res.json({
        compositionId,
        tsxPath: typeof result === 'string' ? result : (result && result.filePath) || '',
        durationFrames,
        status: 'generated',
        method: 'template',
      });
    } catch (e) {
      console.error('[generate/template] Template fill error:', e.message);
      res.status(500).json({ error: 'Template fill error: ' + e.message });
    }
  });
});

module.exports = router;
