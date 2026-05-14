const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getGenerationPrompt } = require('../lib/prompts');
// TemplateManager and template-prompt kept for potential fallback
// const TemplateManager = require('../lib/template-manager');
// const { getTemplateFillingPrompt } = require('../lib/template-prompt');

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
// Template-based generation — AI fills content values only, template handles layout.
// When visualDescription is provided, falls back to free-form TSX generation guided
// by the pre-approved visual layout description.
// ──────────────────────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────────────────────
// Free-form generation — LLM generates full TSX directly, guided by design system
// and quality rules. Palette colors are injected into the prompt.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/template', (req, res) => {
  const { proposal, transcriptSegment, provider, model, apiKey, sessionDir, customPalette, paletteCategory } = req.body;
  if (customPalette) console.log('[generate/free-form] Custom palette received:', customPalette.bg, customPalette.accent);
  else console.log('[generate/free-form] No custom palette');
  console.log('[generate/free-form] provider=' + provider + ' model=' + model + ' type=' + (proposal && proposal.type));

  if (!proposal || !transcriptSegment) {
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const compositionId = (proposal.id + '-v' + (proposal.version || 1)).replace(/_/g, '-');
  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  // Free-form: LLM generates complete TSX code with expressive animations
  const { systemMsg, userMsg } = getGenerationPrompt({
    transcriptSegment,
    type: proposal.type,
    description: proposal.description,
    durationFrames,
    compositionId,
    brandfetchKey: '',
    customPalette: customPalette || null,
    paletteCategory: paletteCategory || null,
  });

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    if (err) return res.status(500).json({ error: 'LLM error: ' + err.message });

    if (!rawCode || rawCode.trim().length === 0) {
      console.error('[generate/free-form] LLM returned empty response. provider=' + provider + ' model=' + model);
      return res.status(500).json({ error: 'LLM returned empty response \u2014 check API key and model' });
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
