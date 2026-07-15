/**
 * Prompts for Motion-Pro LLM generation
 * v1.1.0 — Custom palette + category support + gradient encouragement
 *
 * This file is the orchestrator: it assembles the systemMsg/userMsg prompt
 * pairs sent to the LLM for each pipeline stage (visual proposal, generation,
 * feedback). The underlying content lives in sibling modules under
 * lib/prompts/ (system prompt doc loading, palette code generation, the
 * Remotion component-template library, and per-type creative instructions).
 */
const { DEFAULT_PALETTE, validatePalette } = require('./color-extractor');
const { buildSystemPrompt } = require('./prompts/system-prompt');
const { buildPaletteCode, paletteContextNote, isGreenish } = require('./prompts/palette-prompt');
const { getComponentsForType } = require('./prompts/composition-defs');
const { TYPE_INSTRUCTIONS, getTypeInstructions } = require('./prompts/type-instructions');

function _componentName(compositionId) {
  let name = compositionId
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  if (/^\d/.test(name)) name = 'M' + name;
  return name;
}

// ──────────────────────────────────────────────────────────────────────────────
// Visual Proposal Prompt — generates a detailed visual layout description
// ──────────────────────────────────────────────────────────────────────────────

function getVisualProposalPrompt({ transcriptSegment, type, description, durationFrames, customPalette, paletteCategory }) {
  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const durationSecs = (durationFrames / 30).toFixed(1);

  // Resolve palette colors for the prompt description
  const p = customPalette ? (validatePalette(customPalette) || DEFAULT_PALETTE) : DEFAULT_PALETTE;
  const paletteNote = paletteContextNote(customPalette, paletteCategory);

  const systemMsg = `You are a motion graphics art director for an educational video production company.
Your job is to write concise, actionable visual layout descriptions that will be used by an AI to generate Remotion (React/TSX) animation code.

The design system uses:
- Background: ${p.bg}
- Card background: ${p.card}
- Accent/primary: ${p.accent}
- Secondary colors: orange ${p.orange}, purple ${p.purple}, red ${p.red}
- Text: ${p.text}, dim: ${p.dim}
- Font: DM Sans (400, 700 weights only)
- Safe area: 1600×740px inside a 1920×1080 canvas (160px left/right margins, 180px top, 160px bottom)
- Icons from lucide-react (geometric SVG icons)
- Components available: GlowCard (dark card with glow), AnimatedText (word-by-word reveal), AccentSeparator (accent line), CascadeItem (stagger blur), ProgressDots (step indicator), AnimatedLine (SVG line draw), OdometerDigit (count-up number)
${paletteNote}

Your description must be:
- Specific enough to generate code from (include sizes, colors, layout direction)
- Bold and expressive — no generic centered grids. Apply the design philosophy above.
- Written in the SAME LANGUAGE as the transcript
- Under 200 words
- Focused on WHAT to show and HOW to arrange it (layout, hierarchy, scale contrasts)

Return ONLY a JSON object with these exact keys:
{
  "visualDescription": "Detailed description of what to show and how to lay it out",
  "layout": "centered-vertical | centered-horizontal | split-horizontal | split-vertical | grid-2x2 | flow-left-right | asymmetric | hero-number | editorial",
  "elements": ["element1", "element2", ...],
  "colorNotes": "Which colors to emphasize for this content"
}`;

  const userMsg = `Animation type: ${type}
Concept: ${description}
Duration: ${durationSecs}s (${durationFrames} frames)

Type-specific visual rules:
${typeGuide}

Transcript segment:
${transcriptSegment}

Describe the ideal visual layout for this motion graphic. Be specific about:
- Element sizes (px or %)
- Layout arrangement
- Icon choices (use lucide-react icon names)
- Which accent colors to use for which elements
- Text content (actual labels/titles from the transcript)`;

  return { systemMsg, userMsg };
}

function getGenerationPrompt({ transcriptSegment, type, description, durationFrames, compositionId, brandfetchKey, visualDescription, customPalette, paletteCategory, bgMode }) {
  const systemMsg = buildSystemPrompt(type);

  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const compName = _componentName(compositionId);
  const componentsCode = getComponentsForType(type);

  const logoInstructions = `
## Brand Logos
CRITICAL: When the transcript mentions a brand by name (Meta, Facebook, Google, etc.), 
you MUST use the local SVG logo: <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />.
Do NOT substitute with a lucide-react icon when a local logo exists.

For brand logos, import { staticFile } from 'remotion' and use <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />.

Available logos (in public/logos/):
- meta.svg, facebook.svg, instagram.svg, whatsapp.svg, google.svg, youtube.svg, tiktok.svg, linkedin.svg, twitter.svg, slack.svg, telegram.svg, github.svg, apple.svg, microsoft.svg, amazon.svg, netflix.svg, spotify.svg, pinterest.svg, snapchat.svg

If the brand is NOT in this list, DO NOT use any logo or icon for it. Only use logos we actually have as SVGs. Never fake a brand logo with a lucide-react icon.
DO NOT use cdn.brandfetch.io or any external URL for logos. NEVER reference brandfetch in any way.
DO NOT load images from external CDNs or URLs.`;



  const visualDescriptionBlock = visualDescription ? `## VISUAL DESCRIPTION (FOLLOW THIS EXACTLY)
This layout was pre-approved by the art director. Do NOT use a template — create the layout from scratch based on this description:

${visualDescription}

Your composition MUST match this description precisely. Override any type-specific defaults if needed to match the visual description.

---

` : '';

  const userMsg = `${visualDescriptionBlock}Generate a Remotion composition. You MUST start from this exact template and fill in the sections:

\`\`\`tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, Easing} from 'remotion';
// Import icons as needed from lucide-react (see available-packages.md for full list)
// import { Shield, Lock, Key, Globe, Server, Database, CheckCircle, ArrowRight } from 'lucide-react';
// Import transitions if using TransitionSeries
// import { TransitionSeries, linearTiming } from '@remotion/transitions';
// import { fade } from '@remotion/transitions/fade';

${buildPaletteCode(customPalette, bgMode)}

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, 20], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = from==='up'?interpolate(progress,[0,1],[80,0]):from==='down'?interpolate(progress,[0,1],[-80,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[80,0]):from==='right'?interpolate(progress,[0,1],[-80,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.85,1]):1;
  return <div style={{transform:\`translate(\${x}px,\${y}px) scale(\${sc})\`,opacity:progress,...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  const _fi = Math.max(1, fi);
  const _fo = Math.max(1, fo);
  const _end = Math.max(_fi + 1, dur - _fo);
  return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

${componentsCode}

// === YOUR SECTIONS GO HERE ===

export const ${compName}:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={150} premountFor={10}><Section1/></Sequence>
      <Sequence from={150} durationInFrames={200} premountFor={10}><Section2/></Sequence>
      {/* ... more sections, NO overlaps */}
    </AbsoluteFill>
  );
};
\`\`\`
${paletteContextNote(customPalette, paletteCategory, bgMode)}

## GRADIENTS (ENCOURAGED)
Use CSS linear-gradient and radial-gradient freely to add depth and sophistication:
- Card backgrounds: \`background: 'linear-gradient(135deg, \${C.card}, \${C.bg})'\`
- Accent elements: \`background: 'linear-gradient(90deg, \${C.accent}, \${C.purple})'\`
- Glow effects: \`background: 'radial-gradient(circle, \${C.accent}15, transparent 70%)'\`
- Progress bars: \`background: 'linear-gradient(90deg, \${C.accent}, \${C.orange})'\`
Use gradients especially for hero sections, card headers, progress bars, and background accent areas.
NEVER use gradients that reduce text readability. Text contrast must remain high.

## Composition Details
- Export name: ${compName}
- Duration: ${durationFrames} frames (${(durationFrames / 30).toFixed(1)} seconds)
- Animation type: ${type}
- Description: ${description}

## Type-Specific Instructions
${typeGuide}
${logoInstructions}

## Transcript Segment
${transcriptSegment}

## TIMING — CRITICAL
- This composition starts at FRAME 0, which corresponds to the FIRST timestamp in the transcript above
- To convert transcript times to frames: frame = (time - firstTimestamp) × 30
- Example: if transcript starts at [30.0s] and something happens at [35.0s], that's frame = (35-30)*30 = 150
- The FIRST visual section should start at frame 0
- Sections should be sequential: Section 1 starts at 0, Section 2 starts where Section 1 ends, etc.
- The **total animated content** (last frame with meaningful visuals) must reach at least frame ${Math.max(0, durationFrames - 45)} — do not end all motion at frame 60 if the composition is ${durationFrames} frames long (that causes a short video file and "empty" timeline tails in Premiere).
- Align beats to the transcript: when the speaker introduces an idea at timestamp T, the corresponding visual should appear at frame (T - firstTimestamp) × 30, not tens of seconds earlier.

## MULTI-SECTION STRUCTURE (IMPORTANT)
- This composition should have MULTIPLE internal sections that evolve with the narration
- Each section = one <Sequence> or one part of a <TransitionSeries>
- Use hard cuts between sections — NO crossfade. If transition needed, use slide() only (5-8 frames max)
- Each section should have NEW visual content (not just the same elements staying static)
- Think of this as a MINI FILM that tells a visual story alongside the narrator
- Minimum 2-3 sections for clips under 15s, 3-5 sections for clips 15-30s

## MANDATORY RULES (violation = rejected)
1. Start from the EXACT template above — keep ALL imports, C palette, Safe, E, Fd components exactly as shown
2. The AbsoluteFill MUST have style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}
3. ALL text elements must use fontFamily:"'DM Sans',sans-serif" — this is the CORPORATE FONT, never use IBM Plex Sans
4. ALL content must be inside <Safe> wrapper — NOTHING may exit the safe zone
5. Use <Sequence from={frame} durationInFrames={dur}> — frame 0 is the START of this clip, NOT the absolute timeline time. If the transcript says [30.0s - 45.0s], that maps to frames 0-450 in your composition. Calculate: frame = (transcriptTime - clipStartTime) * 30
6. Last section uses <Fd dur={totalDuration} fi={10} fo={1}> so it stays visible until the very last frame. The composition MUST have visible animated content from frame 0 to frame ${durationFrames}. The last Sequence or Fd component must extend to the final frame.
7. Colors: ONLY from const C — never invent colors
8. Min font size: 24px. Weights: 400 or 700 only
9. NO Audio, NO Html5Audio — this is visual-only. staticFile is ONLY allowed for logo SVGs from public/logos/
10. NO grid/pattern background — solid C.bg only
11. Icons: ALWAYS use lucide-react icons (import from 'lucide-react'). NEVER draw SVG manually. Size: 60-100px for main icons
12. Elements must fill 70%+ of the safe area (1600×740px usable)
13. Use @remotion/shapes for geometric elements (Circle, Rect, Triangle, Star) instead of manual SVG
14. Prefer hard cuts between sections. Only use slide() transition if truly needed (5-8 frames max). NEVER use fade() or crossfade
15. LANGUAGE: All text in the composition must be in the SAME LANGUAGE as the transcript. If transcript is in English, all labels/titles/text must be in English. If Spanish, in Spanish.
16. NO GAPS: The animation MUST have visible content from frame 0 to the last frame. No empty/black frames. The FIRST visual element must appear at frame 0 (not frame 30 or later). The LAST visual element must persist until the final frame. Each motion's video must fill 100% of its duration.
17. BACKGROUND: The <AbsoluteFill> with backgroundColor:C.bg is your CONSTANT BACKGROUND. It is ALWAYS visible. Content inside <Sequence> blocks appears ON TOP of this background. When a Sequence ends, the background remains — NOT transparency/green.
18. CONTINUOUS CONTENT: Every frame from 0 to ${durationFrames} must have at least ONE visible element besides the background. If you use <Sequence> blocks, ensure they OVERLAP or are CONTINUOUS — no gaps between sequences. The simplest way: use overlapping durations. Example: Section A = from 0 dur 150, Section B = from 120 dur 150 (overlap of 30 frames).
19. LAST SECTION PERSISTENCE: The last visual section must use <Fd dur={totalDuration} fi={10} fo={1}> so it stays visible until the very end. Never let the last section fade out early.
20. Z-INDEX LAYERING: When stacking elements, text/titles must ALWAYS be on top. Use position:'relative' and zIndex to control layering. Never place a background box OVER text content. If you need a text overlay, use a semi-transparent background (C.card with opacity 0.9) BEHIND the text, not on top. Stack order: background → decorative elements → cards/boxes → text/icons.
21. IMPORT SAFETY: Only import from these packages:
    - 'remotion' (AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, Audio, staticFile, Easing, random)
    - 'lucide-react' (any icon)
    - '@remotion/transitions' (TransitionSeries, linearTiming)
    - '@remotion/transitions/fade' (fade)
    - '@remotion/transitions/slide' (slide)
    - '@remotion/shapes' (Rect, Circle, Triangle, Star, Pie)
    - '@remotion/paths' (evolvePath, getLength, getPointAtLength)
    - '@remotion/noise' (noise2D, noise3D)
    DO NOT import from any other package. DO NOT use @remotion/motion-blur (Trail is disabled — it crashes renders). DO NOT use named exports that don't exist in these packages.
22. INTERPOLATION CLAMPING: ALL interpolate() calls MUST include { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }. Missing clamping causes visual glitches (opacity > 1, positions overshoot).
23. STAGGER: Never show all elements at once. Stagger entrances by 5-8 frames between elements. First element at d=0, second at d=6, third at d=12, etc.
24. HOLD TIME (CRITICAL): Text must be READABLE. After text entrance animation completes, it must remain STATIC and VISIBLE for AT LEAST:
    - Titles (1-4 words): 60 frames (2s)
    - Short text (5-8 words): 90 frames (3s)
    - Medium text (9-15 words): 120 frames (4s)
    - Long text (16+ words): 150 frames (5s)
    The entrance animation duration does NOT count as reading time. Text that appears and disappears in under 2 seconds is USELESS — the viewer cannot read it.
25. PREMOUNT: ALL <Sequence> components MUST include premountFor={10} to prevent pop-in artifacts.
26. EASING DIRECTION: Use Easing.out or Easing.bezier(0.16,1,0.3,1) for entrances. Use Easing.in for exits. NEVER use linear easing for element motion.
27. TEXT CONTRAST: All readable text must use C.text (#ffffff). Only use C.dim for metadata/captions. NEVER use dim colors for content that must be read.
28. SPELLING CORRECTION: If the transcript has obvious typos or truncated words (e.g., "markete" instead of "marketer"), fix them in the visual. The motion must look correct.
29. NO DECORATIVE ELEMENTS: Every visual element MUST serve the narrative. Specifically BANNED: stars (✨⭐), sparkles, floating dots, orbiting shapes, random arrows, CTA buttons ("¡Comienza ahora!"), badges, ribbons. This is a VIDEO, not an app — nothing is clickable. Only allowed decorations: AccentSeparator lines, card borders, icon circle containers, shadows.
30. NO OSCILLATION: Never animate values with pendulum/bounce/zigzag without narrative reason. If a number changes, it changes ONCE from A to B.
31. CENTERED LAYOUT: Content must be vertically AND horizontally centered in the safe area. The visual center of gravity must be at the center of the frame. Never cluster content in one corner.
32. STEPS/PROGRESS: Show ONE step at a time, CENTERED. Previous steps disappear completely (not dimmed on the side). Only the active step + progress indicator visible.
33. NO CROSSFADE: NEVER use TransitionSeries with fade(). Use hard cuts (<Sequence> blocks) or slide() transition (5-8 frames max). Crossfade makes both scenes visible simultaneously — it looks broken.
34. SAFE VALUES: When using interpolate() results in .toFixed(), Math.round(), or similar — always provide a fallback: \`(interpolate(...) || 0).toFixed(1)\`. Undefined values crash the render.
35. NO BLINKING: No opacity flashing or blinking on any element. No Math.sin/cos on opacity.
36. NO PER-CHARACTER STYLING: Never apply backgrounds, borders, or 3D effects to individual characters/letters. Text renders as a single block.
37. ICON CONTRAST: Icons must use C.accent, C.text, C.orange, C.purple, C.red, or C.green. NEVER use gray, dark, or dim colors for icons. Icons must be clearly visible against C.bg.
38. SAME ELEMENT = MOVE, NOT REPLACE: If a card/element is already on screen and needs to change position (e.g., making room for a new card), use interpolate on its X/Y position. NEVER fade out and fade in the same element.

Output the COMPLETE TSX file. No explanations before or after the code.`;

  return { systemMsg, userMsg };
}

function getFeedbackPrompt({ currentTsx, feedback, compositionId, type, description, transcriptSegment, customPalette, paletteCategory, bgMode }) {
  const systemMsg = buildSystemPrompt(type);

  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const compName = _componentName(compositionId);

  const transcriptBlock = transcriptSegment
    ? `\n## Transcript (what the professor says during this clip — use for timing and content)
${transcriptSegment}\n`
    : '';

  // Build the correct palette code for the current bgMode so the LLM uses it
  const paletteCode = buildPaletteCode(customPalette, bgMode);

  let bgNote = '';
  if (bgMode === 'light') {
    bgNote = '\n**LIGHT MODE ACTIVE**: Background is light (#f8f9fa). Card backgrounds use a subtle tint (C.card).\n'
      + '- ALL text MUST be dark (C.text) or use C.accent/C.green/C.orange colors — NEVER white text.\n'
      + '- Card/box backgrounds: use C.card (subtle accent tint) or accent colors with low opacity (e.g. C.accent + "15").\n'
      + '- Icons and decorative elements: use the accent colors from C (already adjusted for light-background contrast).\n'
      + '- Do NOT use #fff, #ffffff, or any light color for text/titles/labels — invisible on light background.';
  } else if (bgMode === 'chroma') {
    const p = customPalette ? (validatePalette(customPalette) || DEFAULT_PALETTE) : DEFAULT_PALETTE;
    const hasGreen = isGreenish(p.accent) || isGreenish(p.green);
    const chromaColor = hasGreen ? 'blue (#0000FF)' : 'green (#00FF00)';
    bgNote = `\n**CHROMA KEY MODE**: Background is solid ${chromaColor}. DO NOT use ${hasGreen ? 'blue' : 'green'} colors in any visual element.`;
  } else if (bgMode === 'alpha') {
    bgNote = '\n**ALPHA/TRANSPARENT MODE**: Background is transparent. Video renders with alpha channel (ProRes 4444). Cards float over the video.';
  }

  const userMsg = `The user wants SPECIFIC CHANGES to this Remotion composition. Read their feedback carefully and apply exactly what they ask.

## User Feedback (THIS IS YOUR #1 PRIORITY — apply these changes)
${feedback}

## Animation Type: ${type}
${description ? 'Description: ' + description : ''}
${transcriptBlock}
## MANDATORY Color Palette (replace the C object in the code with this one)
\`\`\`ts
${paletteCode}
\`\`\`${bgNote}

## Type Rules (maintain these unless feedback contradicts)
${typeGuide}

## Current Code (modify this file)
\`\`\`tsx
${currentTsx}
\`\`\`

## Mandatory after modifications
1. **APPLY THE FEEDBACK FIRST** — everything else is secondary to what the user asked
2. **USE THE PALETTE ABOVE** — replace the C object with the one provided
3. Export as \`${compName}\`
4. Keep the template structure: imports, C palette, Safe, E, Fd components inline
5. The AbsoluteFill MUST have fontFamily:"'DM Sans',sans-serif"
6. ALL text must use fontFamily:"'DM Sans',sans-serif" — corporate font
7. ALL content inside <Safe> — nothing outside safe zone
8. Background: solid C.bg only. NO audio. Colors from C only.
9. E component uses Easing.bezier(0.16, 1, 0.3, 1) with clamping — keep as defined in template
10. Keep same timing/duration unless feedback changes it
11. Frame 0 = start of clip. Sections are RELATIVE to frame 0, not absolute timeline time
12. **Sync visual elements to the transcript timing** — each section should correspond to what the professor is saying at that moment

Output the COMPLETE modified TSX file. No explanations.`;

  return { systemMsg, userMsg };
}

module.exports = { getGenerationPrompt, getFeedbackPrompt, getTypeInstructions, getVisualProposalPrompt };
