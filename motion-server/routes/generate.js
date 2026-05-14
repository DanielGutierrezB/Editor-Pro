const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getGenerationPrompt } = require('../lib/prompts');
const { getStaticLayoutPrompt } = require('../lib/static-layout-prompt');
const { injectAnimWrapper } = require('../lib/anim-wrapper');

/** HH-MM-SS-mmm timestamp for unique file IDs (ms prevents same-second collisions) */
function _timeStamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return hh + '-' + mm + '-' + ss + '-' + ms;
}

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
    console.error('[generate/free-form] Missing proposal or transcriptSegment');
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const manager = new RemotionManager(req.app.locals.renderProject);

  const compositionId = (proposal.id + '-v' + (proposal.version || 1) + '-' + _timeStamp()).replace(/_/g, '-');
  console.log('[generate/free-form] START compositionId=' + compositionId + ' type=' + proposal.type + ' provider=' + provider + ' model=' + model);
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

  const llmStart = Date.now();
  console.log('[generate/free-form] Sending to LLM (' + provider + '/' + model + ')...');
  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    const llmMs = Date.now() - llmStart;
    if (err) {
      console.error('[generate/free-form] LLM error after ' + llmMs + 'ms:', err.message);
      return res.status(500).json({ error: 'LLM error: ' + err.message });
    }

    console.log('[generate/free-form] LLM responded in ' + llmMs + 'ms (' + (rawCode || '').length + ' chars)');
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
        console.error('[generate/free-form] Syntax error in ' + compositionId + ':', (result.errors || []).join('; '));
        return res.status(500).json({ 
          error: 'Syntax error in generated TSX: ' + (result.errors || []).join('; '),
          compositionId,
        });
      }
      
      // Save back to session folder
      if (sessionDir) manager.saveToSession(compositionId, sessionDir);
      console.log('[generate/free-form] OK compositionId=' + compositionId + ' frames=' + durationFrames + ' totalMs=' + (Date.now() - llmStart + llmMs));
      res.json({
        compositionId,
        tsxPath: typeof result === 'string' ? result : (result && result.filePath) || '',
        durationFrames,
        status: 'generated',
      });
    } catch (writeErr) {
      console.error('[generate/free-form] Write error for ' + compositionId + ':', writeErr.message);
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
// Static Layout + Animation Engine
// LLM generates only layout + styling (no animation code).
// The Anim wrapper handles all motion automatically.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/template', (req, res) => {
  const { proposal, transcriptSegment, provider, model, apiKey, sessionDir, customPalette, paletteCategory, bgMode } = req.body;
  if (customPalette) console.log('[generate/static-layout] Custom palette:', customPalette.bg, customPalette.accent);
  console.log('[generate/static-layout] provider=' + provider + ' model=' + model + ' type=' + (proposal && proposal.type) + ' bgMode=' + bgMode);

  if (!proposal || !transcriptSegment) {
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }

  const compositionId = (proposal.id + '-v' + (proposal.version || 1) + '-' + _timeStamp()).replace(/_/g, '-');
  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  // Static Layout: LLM designs layout only, Anim wrapper handles motion
  const { systemMsg, userMsg } = getStaticLayoutPrompt({
    transcriptSegment,
    type: proposal.type,
    description: proposal.description,
    durationFrames,
    compositionId,
    customPalette: customPalette || null,
    paletteCategory: paletteCategory || null,
    bgMode: bgMode || 'dark',
  });

  const llmStart = Date.now();
  console.log('[generate/static-layout] Sending to LLM — compositionId=' + compositionId + ' frames=' + durationFrames + '...');
  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    const llmMs = Date.now() - llmStart;
    if (err) {
      console.error('[generate/static-layout] LLM error after ' + llmMs + 'ms:', err.message);
      return res.status(500).json({ error: 'LLM error: ' + err.message });
    }

    if (!rawCode || rawCode.trim().length === 0) {
      console.error('[generate/static-layout] LLM returned empty response after ' + llmMs + 'ms');
      return res.status(500).json({ error: 'LLM returned empty response' });
    }

    console.log('[generate/static-layout] LLM responded in ' + llmMs + 'ms (' + rawCode.length + ' chars)');

    let tsxCode = rawCode;
    const codeMatch = rawCode.match(/```(?:tsx?|jsx?|react)?\s*\n([\s\S]*?)```/);
    if (codeMatch) tsxCode = codeMatch[1].trim();

    // Inject the Anim and Section animation implementations
    tsxCode = injectAnimWrapper(tsxCode);
    console.log('[generate/static-layout] Anim wrapper injected, writing composition...');

    try {
      const manager = new RemotionManager(req.app.locals.renderProject);
      if (sessionDir) manager.syncFromSession(sessionDir);
      const result = manager.writeComposition(compositionId, tsxCode, durationFrames);

      if (result && result.syntaxError) {
        console.error('[generate/static-layout] Syntax error in ' + compositionId + ':', (result.errors || []).join('; '));
        return res.status(500).json({
          error: 'Syntax error in generated TSX: ' + (result.errors || []).join('; '),
          compositionId,
        });
      }

      if (sessionDir) manager.saveToSession(compositionId, sessionDir);
      const totalMs = Date.now() - llmStart;
      console.log('[generate/static-layout] OK compositionId=' + compositionId + ' frames=' + durationFrames + ' llmMs=' + llmMs + ' totalMs=' + totalMs);

      res.json({
        compositionId,
        tsxPath: typeof result === 'string' ? result : (result && result.filePath) || '',
        durationFrames,
        status: 'generated',
        method: 'static-layout',
      });
    } catch (writeErr) {
      console.error('[generate/static-layout] Write error for ' + compositionId + ':', writeErr.message);
      res.status(500).json({ error: 'Write error: ' + writeErr.message });
    }
  });
});

module.exports = router;
