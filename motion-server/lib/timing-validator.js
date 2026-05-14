/**
 * timing-validator.js — Algorithmic timing validator for motion graphics.
 * 
 * Takes a proposed timing plan from the LLM and validates/adjusts it to ensure:
 * - Every element has minimum visible time based on text length
 * - No element gets cut off at composition end
 * - Elements don't overlap awkwardly
 * - Stagger delays are reasonable
 *
 * Runs in pure JS (no LLM), executes in <1ms.
 */

const FPS = 30;

// Minimum visible time (frames) by estimated reading complexity
const MIN_VISIBLE = {
  icon:    1.0 * FPS,  // 30 frames = 1.0s
  short:   1.5 * FPS,  // 45 frames = 1.5s  (< 5 words)
  medium:  2.5 * FPS,  // 75 frames = 2.5s  (5-15 words)
  long:    3.5 * FPS,  // 105 frames = 3.5s (> 15 words)
};

// Entrance animation duration (must complete before element is "visible")
const ENTRANCE_FRAMES = 24;  // 0.8s entrance animation
// Section fade-out duration
const SECTION_FADE_OUT = 15; // 0.5s fade out
// Maximum allowed gap between elements (frames)
const MAX_GAP_FRAMES = 2.5 * FPS; // 75 frames = 2.5s — any longer is dead time
// Minimum coverage: elements should visually cover at least this % of the composition
const MIN_COVERAGE_PCT = 0.80; // 80% of total frames should have something visible

/**
 * Classify text complexity for minimum visible time.
 */
function _textComplexity(text) {
  if (!text) return 'icon';
  const words = text.trim().split(/\s+/).length;
  if (words <= 2) return 'icon';
  if (words <= 5) return 'short';
  if (words <= 15) return 'medium';
  return 'long';
}

/**
 * Calculate minimum frames an element needs to be fully visible
 * (entrance animation + reading time).
 */
function _minFramesNeeded(text) {
  const complexity = _textComplexity(text);
  return ENTRANCE_FRAMES + MIN_VISIBLE[complexity];
}

/**
 * Validate and adjust a timing plan for a single segment.
 *
 * @param {Object} plan - Proposed timing plan from LLM
 *   plan.totalFrames  - Total composition duration in frames
 *   plan.elements[]   - Array of { text, idealFrame, type? }
 *     idealFrame: frame when element should appear (based on transcript timestamp)
 *     text: the text content of the element
 *     type: optional type hint (icon, title, subtitle, item, etc.)
 *
 * @returns {Object} Validated plan with adjustments
 *   elements[].frame      - Adjusted frame (may differ from idealFrame)
 *   elements[].minVisible - Minimum visible frames needed
 *   elements[].adjusted   - Whether timing was changed from ideal
 *   elements[].strategy   - What adjustment was made (if any)
 *   conflicts[]           - Array of conflict descriptions
 *   valid                 - Whether the plan passed without changes
 */
function validateTimingPlan(plan) {
  if (!plan || !plan.elements || !plan.elements.length) {
    return { elements: [], conflicts: [], valid: true };
  }

  const total = plan.totalFrames || 300; // default 10s
  const elements = plan.elements.map(function(el, i) {
    const minNeeded = _minFramesNeeded(el.text);
    return {
      index: i,
      text: el.text || '',
      idealFrame: Math.round(el.idealFrame || 0),
      frame: Math.round(el.idealFrame || 0), // will be adjusted
      minVisible: minNeeded,
      type: el.type || _textComplexity(el.text),
      adjusted: false,
      strategy: null,
    };
  });

  const conflicts = [];

  // Sort by idealFrame for sequential processing
  elements.sort(function(a, b) { return a.idealFrame - b.idealFrame; });

  // ── Pass 1: Check each element has enough time before composition ends ──
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var endFrame = total - SECTION_FADE_OUT;
    var visibleFrames = endFrame - el.frame - ENTRANCE_FRAMES;

    if (visibleFrames < MIN_VISIBLE[_textComplexity(el.text)]) {
      // Element would get cut off — anticipate it
      var needed = el.minVisible;
      var newFrame = endFrame - needed;

      // Don't overlap with previous element
      if (i > 0) {
        var prevEnd = elements[i - 1].frame + elements[i - 1].minVisible;
        if (newFrame < prevEnd) {
          newFrame = prevEnd + 5; // 5-frame gap minimum
        }
      }

      // Clamp to valid range
      newFrame = Math.max(0, Math.min(newFrame, el.frame));

      if (newFrame !== el.frame) {
        conflicts.push(
          'Element ' + (el.index + 1) + ' ("' + el.text.substring(0, 30) + '...") only had ' +
          Math.round(visibleFrames) + ' visible frames, needs ' + Math.round(MIN_VISIBLE[_textComplexity(el.text)]) +
          '. Anticipated from frame ' + el.idealFrame + ' → ' + newFrame
        );
        el.frame = Math.round(newFrame);
        el.adjusted = true;
        el.strategy = 'anticipated';
      }
    }
  }

  // ── Pass 2: Check for overlapping elements ──
  for (var j = 1; j < elements.length; j++) {
    var prev = elements[j - 1];
    var curr = elements[j];
    var gap = curr.frame - prev.frame;
    var minGap = 8; // minimum 8 frames (0.27s) between element entrances

    if (gap < minGap) {
      // Elements are too close — compress stagger
      var adjusted = prev.frame + minGap;
      if (adjusted < total - curr.minVisible) {
        conflicts.push(
          'Elements ' + (prev.index + 1) + ' and ' + (curr.index + 1) +
          ' were only ' + gap + ' frames apart. Compressed to ' + minGap + ' frame gap.'
        );
        curr.frame = Math.round(adjusted);
        curr.adjusted = true;
        curr.strategy = curr.strategy ? curr.strategy + '+compressed' : 'compressed';
      }
    }
  }

  // ── Pass 3: Ensure no element starts before frame 0 ──
  for (var k = 0; k < elements.length; k++) {
    if (elements[k].frame < 0) {
      elements[k].frame = 0;
      elements[k].adjusted = true;
      elements[k].strategy = 'clamped-start';
    }
  }

  // ── Pass 4: Detect large gaps between elements ──
  // If element B starts much later than element A, the viewer sees nothing.
  // We flag gaps and compute "hold until" for each element so the LLM knows
  // that element A should STAY on screen until element B appears.
  for (var g = 0; g < elements.length; g++) {
    var gapStart = elements[g].frame + ENTRANCE_FRAMES; // element is fully visible
    var gapEnd;
    if (g < elements.length - 1) {
      gapEnd = elements[g + 1].frame;
    } else {
      gapEnd = total - SECTION_FADE_OUT;
    }
    var gapSize = gapEnd - gapStart;

    // Calculate how long this element should stay visible
    // (until the next element appears, or until composition end)
    elements[g].holdUntil = gapEnd;
    elements[g].visibleDuration = gapEnd - elements[g].frame;

    if (gapSize > MAX_GAP_FRAMES && g < elements.length - 1) {
      conflicts.push(
        'Gap of ' + Math.round(gapSize) + ' frames (' + (gapSize / FPS).toFixed(1) + 's) between elements ' +
        (elements[g].index + 1) + ' and ' + (elements[g + 1].index + 1) +
        '. Element ' + (elements[g].index + 1) + ' should PERSIST on screen until frame ' + gapEnd +
        '. Review the transcript for this time range — there may be supporting details, examples, or key phrases worth visualizing.'
      );
      elements[g].hasGapAfter = true;
    }
  }

  // ── Pass 5: Coverage check ──
  // Estimate how much of the composition has visible content
  var coveredFrames = 0;
  for (var cv = 0; cv < elements.length; cv++) {
    var visStart = elements[cv].frame;
    var visEnd = elements[cv].holdUntil || (total - SECTION_FADE_OUT);
    // Don't double-count overlapping regions
    if (cv > 0) {
      var prevEnd = elements[cv - 1].holdUntil || elements[cv - 1].frame + elements[cv - 1].minVisible;
      visStart = Math.max(visStart, prevEnd);
    }
    coveredFrames += Math.max(0, visEnd - visStart);
  }
  // Add first element's contribution
  if (elements.length > 0) {
    coveredFrames = Math.min(coveredFrames + elements[0].minVisible, total);
  }
  var coveragePct = total > 0 ? coveredFrames / total : 1;
  var needsMoreContent = coveragePct < MIN_COVERAGE_PCT;
  if (needsMoreContent) {
    conflicts.push(
      'Low visual coverage: only ' + Math.round(coveragePct * 100) + '% of ' + total +
      ' frames have visible content. Re-read the transcript — there are likely more concepts, examples, or details worth highlighting visually.'
    );
  }

  // Re-sort by original index for output
  elements.sort(function(a, b) { return a.index - b.index; });

  var isValid = conflicts.length === 0;

  return {
    elements: elements.map(function(el) {
      return {
        text: el.text,
        idealFrame: el.idealFrame,
        frame: el.frame,
        minVisible: el.minVisible,
        holdUntil: el.holdUntil || null,
        visibleDuration: el.visibleDuration || el.minVisible,
        hasGapAfter: el.hasGapAfter || false,
        adjusted: el.adjusted,
        strategy: el.strategy,
      };
    }),
    conflicts: conflicts,
    valid: isValid,
    totalFrames: total,
    coverage: Math.round(coveragePct * 100),
    needsMoreContent: needsMoreContent,
  };
}

/**
 * Build a timing plan from transcript segments for a single motion.
 * 
 * @param {Array} transcriptWords - Array of { text, startTime } from transcript
 * @param {number} clipStartTime - Start time of the motion clip in seconds
 * @param {number} clipEndTime   - End time of the motion clip in seconds
 * @param {Array} proposedElements - Elements from LLM context pass [{ text, timestamp }]
 * @returns {Object} Timing plan ready for validation
 */
function buildTimingPlan(transcriptWords, clipStartTime, clipEndTime, proposedElements) {
  var totalFrames = Math.max(90, Math.round((clipEndTime - clipStartTime) * FPS));

  var elements = (proposedElements || []).map(function(el) {
    // Convert absolute timestamp to relative frame within the clip
    var relativeTime = (el.timestamp || clipStartTime) - clipStartTime;
    var idealFrame = Math.max(0, Math.round(relativeTime * FPS));
    return {
      text: el.text || '',
      idealFrame: idealFrame,
      type: el.type || null,
    };
  });

  return { totalFrames: totalFrames, elements: elements };
}

/**
 * Format a validated timing plan as prompt instructions for the LLM.
 */
function timingPlanToPrompt(validated) {
  if (!validated || !validated.elements || !validated.elements.length) return '';

  var lines = ['## Timing Plan (FOLLOW THESE EXACT DELAYS)'];
  lines.push('Total duration: ' + validated.totalFrames + ' frames (' + (validated.totalFrames / FPS).toFixed(1) + 's)');
  lines.push('Visual coverage: ' + (validated.coverage || '?') + '%');
  lines.push('');

  lines.push('CRITICAL RULE: Elements must PERSIST on screen until the next element appears.');
  lines.push('Do NOT fade out an element early — it stays visible until replaced or until composition ends.');
  lines.push('Use Sections to keep content visible for the full duration of each segment.');
  lines.push('');

  validated.elements.forEach(function(el, i) {
    var note = el.adjusted ? ' ⚠️ adjusted: ' + el.strategy : '';
    var holdNote = el.holdUntil ? ' (visible until frame ' + el.holdUntil + ' = ' + (el.visibleDuration / FPS).toFixed(1) + 's on screen)' : '';
    var gapWarning = el.hasGapAfter ? ' ⚠️ GAP AFTER — keep this element visible!' : '';
    lines.push('Element ' + (i + 1) + ': delay={' + el.frame + '} — "' + el.text.substring(0, 50) + '"' + holdNote + note + gapWarning);
  });

  if (validated.needsMoreContent) {
    lines.push('');
    lines.push('⚠️ LOW COVERAGE: Only ' + validated.coverage + '% of the composition has visual content.');
    lines.push('Re-read the transcript for this segment — extract more concepts, examples, key phrases, or supporting details to visualize.');
    lines.push('Each visual element should be MEANINGFUL and RELATED to what the professor is saying at that moment.');
  }

  if (validated.conflicts.length > 0) {
    lines.push('');
    lines.push('Timing adjustments:');
    validated.conflicts.forEach(function(c) { lines.push('- ' + c); });
  }

  lines.push('');
  lines.push('Use these exact delay values in your <Anim> components. Do NOT change the delays.');
  lines.push('Elements stay visible once they appear — they do NOT disappear until replaced by the next Section.');

  return lines.join('\n');
}

module.exports = { validateTimingPlan, buildTimingPlan, timingPlanToPrompt, _textComplexity, _minFramesNeeded };
