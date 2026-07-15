const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getGenerationPrompt } = require('../lib/prompts');
const { getStaticLayoutPrompt } = require('../lib/static-layout-prompt');
const { injectAnimWrapper } = require('../lib/anim-wrapper');
const { validateTimingPlan, buildTimingPlan, timingPlanToPrompt } = require('../lib/timing-validator');

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
      // writeComposition() only writes this one file and appends it to Root.tsx —
      // it doesn't need (and must NOT trigger) a full syncFromSession, which wipes
      // the shared compositions dir and would race an in-flight render's bundling.
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
  const { proposal, transcriptSegment, provider, model, apiKey, sessionDir, customPalette, paletteCategory, bgMode, contextSummary, segmentContext, timingPrompt } = req.body;
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
    contextSummary: contextSummary || null,
    segmentContext: segmentContext || null,
    timingPrompt: timingPrompt || null,
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
      // See the note in the free-form route above — writeComposition() is additive
      // and syncing here would race an in-flight render's bundling.
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

// ──────────────────────────────────────────────────────────────────────────────
// Context Pass — Analyze full transcript and generate context notes for each
// marked segment before batch generation. One LLM call for the whole batch.
// ──────────────────────────────────────────────────────────────────────────────
router.post('/context', (req, res) => {
  const { fullTranscript, segments, provider, model, apiKey } = req.body;

  if (!fullTranscript || !segments || !segments.length) {
    return res.status(400).json({ error: 'Missing fullTranscript or segments' });
  }

  console.log('[generate/context] Analyzing ' + segments.length + ' segments from transcript (' + fullTranscript.length + ' chars)');

  const segmentList = segments.map(function(s, i) {
    return 'Segment ' + (i + 1) + ' [' + (s.startTime || 0).toFixed(1) + 's - ' + (s.endTime || 0).toFixed(1) + 's] (' + ((s.endTime || 0) - (s.startTime || 0)).toFixed(1) + 's): type=' + (s.type || '?') + ', description="' + (s.description || '') + '"';
  }).join('\n');

  const systemMsg = `You are a video content analyst. You will receive a full transcript of an educational video and a list of segments where motion graphics will be placed.

Your job:
1. Provide context that helps a motion graphics designer understand each segment's role in the overall narrative
2. Plan the timing of visual elements based on transcript timestamps

Respond in the SAME LANGUAGE as the transcript.
Respond ONLY with valid JSON — no markdown, no explanation.`;

  const userMsg = `## Full Transcript (with timestamps)
${fullTranscript}

## Segments to analyze
${segmentList}

## Task
Return a JSON object with:
1. "summary": A 1-2 sentence summary of what this video is about
2. "segments": An array (same order as input) where each element has:
   - "context": What was discussed before this moment that gives it meaning (1-2 sentences)
   - "keyMessage": The core concept or takeaway of this specific segment (1 sentence)
   - "narrativeRole": One of: "introduction", "explanation", "example", "comparison", "summary", "transition", "detail", "conclusion"
   - "timingPlan": Array of visual elements with timing: [{"text": "visible text", "timestamp": seconds_when_professor_says_it, "type": "title|subtitle|item|metric|icon"}]
     → timestamp = the ABSOLUTE second in the video when this concept is mentioned
     → text = what should appear on screen (concise, readable)
     → Each element should represent a meaningful concept from the transcript at that moment
     → Scale with segment duration: ~1 element per 2-3 seconds of content
       (e.g. 5s segment → 2-3 elements, 10s segment → 4-5 elements, 15s+ → 5-7 elements)
     → Spread elements across the ENTIRE segment duration — don't cluster them all at the start
     → Look for: key terms, examples, numbers, comparisons, cause-effect, steps, tools mentioned

Example response:
{"summary":"Video sobre cómo funciona Git","segments":[{"context":"Después de explicar control de versiones","keyMessage":"Git rastrea cambios","narrativeRole":"explanation","timingPlan":[{"text":"Control de versiones","timestamp":12.5,"type":"title"},{"text":"Rastrea cambios en archivos","timestamp":15.2,"type":"subtitle"}]}]}`;

  const llmStart = Date.now();
  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, raw) => {
    const llmMs = Date.now() - llmStart;
    if (err) {
      console.error('[generate/context] LLM error after ' + llmMs + 'ms:', err.message);
      return res.status(500).json({ error: 'Context analysis failed: ' + err.message });
    }

    console.log('[generate/context] LLM responded in ' + llmMs + 'ms (' + (raw || '').length + ' chars)');

    // Parse JSON from response (strip markdown fences if present)
    let parsed;
    try {
      let jsonStr = raw.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[generate/context] Failed to parse context JSON:', parseErr.message);
      // Return a usable fallback instead of failing the whole batch
      parsed = { summary: '', segments: segments.map(function() { return { context: '', keyMessage: '', narrativeRole: '' }; }) };
    }

    // Validate timing plans for each segment
    const validatedSegments = (parsed.segments || []).map(function(seg, i) {
      const s = segments[i];
      if (seg.timingPlan && seg.timingPlan.length > 0 && s) {
        const plan = buildTimingPlan(null, s.startTime || 0, s.endTime || 0, seg.timingPlan);
        const validated = validateTimingPlan(plan);
        if (validated.conflicts.length > 0) {
          console.log('[generate/context] Timing adjustments for segment ' + (i + 1) + ': ' + validated.conflicts.join('; '));
        }
        seg.validatedTiming = validated;
        seg.timingPrompt = timingPlanToPrompt(validated);
      }
      return seg;
    });

    res.json({
      summary: parsed.summary || '',
      segments: validatedSegments,
      llmMs: llmMs,
    });
  });
});

module.exports = router;
