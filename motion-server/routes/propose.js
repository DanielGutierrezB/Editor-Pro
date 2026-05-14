const express = require('express');
const router = express.Router();
const { sendLLM } = require('../lib/llm');
const { getVisualProposalPrompt } = require('../lib/prompts');

// POST /api/generate/propose — generate a visual layout description for a proposal
router.post('/', (req, res) => {
  const { proposal, transcriptSegment, provider, model, apiKey, customPalette, paletteCategory } = req.body;

  if (!proposal || !transcriptSegment) {
    console.error('[propose] Missing proposal or transcriptSegment');
    return res.status(400).json({ error: 'Missing proposal or transcriptSegment' });
  }
  console.log('[propose] START id=' + proposal.id + ' type=' + proposal.type + ' provider=' + provider + ' model=' + model);

  const durationSecs = (proposal.endTime || 0) - (proposal.startTime || 0);
  const durationFrames = Math.max(90, Math.round(durationSecs * 30) + 6);

  const { systemMsg, userMsg } = getVisualProposalPrompt({
    transcriptSegment,
    type: proposal.type,
    description: proposal.description,
    durationFrames,
    customPalette: customPalette || null,
    paletteCategory: paletteCategory || null,
  });

  const llmStart = Date.now();
  console.log('[propose] Sending to LLM...');
  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawResponse) => {
    const llmMs = Date.now() - llmStart;
    if (err) {
      console.error('[propose] LLM error after ' + llmMs + 'ms: ' + err.message);
      return res.status(500).json({ error: 'LLM error: ' + err.message });
    }

    if (!rawResponse || rawResponse.trim().length === 0) {
      console.error('[propose] LLM returned empty response after ' + llmMs + 'ms');
      return res.status(500).json({ error: 'LLM returned empty response' });
    }
    console.log('[propose] LLM responded in ' + llmMs + 'ms (' + rawResponse.length + ' chars)');

    try {
      let jsonStr = rawResponse.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(jsonStr);

      console.log('[propose] OK id=' + proposal.id + ' llmMs=' + llmMs);
      res.json({
        proposalId: proposal.id,
        visualDescription: parsed.visualDescription || '',
        layout: parsed.layout || '',
        elements: parsed.elements || [],
        colorNotes: parsed.colorNotes || '',
      });
    } catch (e) {
      console.error('[propose] Parse error: ' + e.message);
      res.status(500).json({ error: 'Failed to parse visual proposal: ' + e.message, raw: rawResponse.substring(0, 500) });
    }
  });
});

module.exports = router;
