/**
 * Static Layout Prompt v2 — LLM generates ONLY layout + styling (no animation code).
 * Key improvements over v1:
 * - Prohibits position:absolute inside Safe
 * - Forces complete sentences (not scattered words)
 * - Requires Section wrappers for clips > 5s
 * - Limits elements per section
 * - Much clearer examples
 */
const { DEFAULT_PALETTE, validatePalette, getCategoryDescription } = require('./color-extractor');
const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.resolve(__dirname, '..', '..', 'Prompts', 'MotionPro');

function _loadDoc(name) {
  const p = path.join(PROMPTS_DIR, name);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return '';
}

const DESIGN_SYSTEM = _loadDoc('DESIGN.md');

// ── Palette helpers ──────────────────────────────────────────────────────────

// Chroma key colors
const CHROMA_GREEN = '#00FF00';
const CHROMA_BLUE = '#0000FF';

function _parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return { r: parseInt(h.substr(0,2),16), g: parseInt(h.substr(2,2),16), b: parseInt(h.substr(4,2),16) };
}

function _isGreenish(hex) {
  const c = _parseHex(hex);
  if (!c) return false;
  return c.g > 150 && c.g > c.r * 1.3 && c.g > c.b * 1.3;
}

function _isBluish(hex) {
  const c = _parseHex(hex);
  if (!c) return false;
  return c.b > 120 && c.b > c.r * 1.2 && c.b > c.g * 1.2;
}

// Replace colors that would blend with the chroma background
function _chromaSafe(hex, chromaIsBlue) {
  if (chromaIsBlue && _isBluish(hex)) return '#fb923c'; // swap blue→orange
  if (!chromaIsBlue && _isGreenish(hex)) return '#a78bfa'; // swap green→purple
  return hex;
}

function _luminance(hex) {
  const c = _parseHex(hex);
  if (!c) return 1;
  const [rs, gs, bs] = [c.r / 255, c.g / 255, c.b / 255].map(v =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function _contrastRatio(hex1, hex2) {
  const l1 = _luminance(hex1), l2 = _luminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function _darken(hex, amount) {
  const c = _parseHex(hex);
  if (!c) return hex;
  return '#' + [c.r, c.g, c.b].map(v => Math.round(v * (1 - amount)).toString(16).padStart(2, '0')).join('');
}

function _ensureContrast(fg, bg, min) {
  min = min || 4.5;
  for (let i = 0; i < 10; i++) {
    if (_contrastRatio(fg, bg) >= min) return fg;
    fg = _darken(fg, 0.15);
  }
  return fg;
}

function _buildLightPalette(p) {
  const lightBg = '#f8f9fa';
  const accent = _ensureContrast(p.accent, lightBg, 4.5);
  const green  = _ensureContrast(p.green, lightBg, 4.5);
  const orange = _ensureContrast(p.orange, lightBg, 4.5);
  const purple = _ensureContrast(p.purple, lightBg, 4.5);
  const red    = _ensureContrast(p.red, lightBg, 4.5);
  const ac = _parseHex(p.accent);
  const cardTint = ac ? `rgba(${ac.r},${ac.g},${ac.b},0.06)` : 'rgba(0,0,0,0.03)';
  const glowColor = ac ? `rgba(${ac.r},${ac.g},${ac.b},0.08)` : 'rgba(0,0,0,0.04)';
  return {
    bg: lightBg, card: cardTint, accent, green, orange, purple, red,
    text: '#1a1d23', dim: 'rgba(0,0,0,0.55)',
    border: 'rgba(0,0,0,0.10)', glow: glowColor,
  };
}

function _buildPaletteCode(customPalette, bgMode) {
  const p = customPalette ? (validatePalette(customPalette) || DEFAULT_PALETTE) : DEFAULT_PALETTE;
  let bg = p.bg, card = p.card, text = p.text, dim = p.dim, border = p.border, glow = p.glow;

  if (bgMode === 'light') {
    const lp = _buildLightPalette(p);
    return `const C = {
  bg:'${lp.bg}', card:'${lp.card}', accent:'${lp.accent}', green:'${lp.green}',
  orange:'${lp.orange}', purple:'${lp.purple}', red:'${lp.red}', text:'${lp.text}',
  dim:'${lp.dim}', border:'${lp.border}',
  glow:'${lp.glow}',
};`;
  } else if (bgMode === 'chroma') {
    // Use green chroma by default; if accent/green are greenish, use blue
    const hasGreen = _isGreenish(p.accent) || _isGreenish(p.green);
    const chromaIsBlue = hasGreen;
    bg = chromaIsBlue ? CHROMA_BLUE : CHROMA_GREEN;
    card = 'rgba(0,0,0,0.65)';
    // Swap any palette color that would blend with the chroma bg
    return `const C = {
  bg:'${bg}', card:'${card}', accent:'${_chromaSafe(p.accent, chromaIsBlue)}', green:'${_chromaSafe(p.green, chromaIsBlue)}',
  orange:'${_chromaSafe(p.orange, chromaIsBlue)}', purple:'${_chromaSafe(p.purple, chromaIsBlue)}', red:'${_chromaSafe(p.red, chromaIsBlue)}', text:'${text}',
  dim:'${dim}', border:'${border}',
  glow:'${glow}',
};`;
  }

  return `const C = {
  bg:'${bg}', card:'${card}', accent:'${p.accent}', green:'${p.green}',
  orange:'${p.orange}', purple:'${p.purple}', red:'${p.red}', text:'${text}',
  dim:'${dim}', border:'${border}',
  glow:'${glow}',
};`;
}

function _paletteNote(customPalette, paletteCategory, bgMode) {
  const parts = [];
  if (paletteCategory && paletteCategory !== 'auto') {
    const desc = getCategoryDescription(paletteCategory);
    if (desc) parts.push(`Visual style: ${desc}`);
  }
  if (customPalette) {
    const p = validatePalette(customPalette);
    if (p) parts.push(`Custom palette — bg: ${p.bg}, accent: ${p.accent}, card: ${p.card}. Use these colors.`);
  }
  if (bgMode === 'light') {
    parts.push(`LIGHT MODE ACTIVE — Design rules:
- Background is LIGHT (#f8f9fa). Card backgrounds use a subtle accent tint (C.card).
- ALL text MUST be dark (C.text = '#1a1d23') or use accent colors from C — NEVER white text.
- For card/box backgrounds: use C.card or accent colors with low opacity (C.accent + '15').
- Icons/decorative elements: use C.accent, C.green, C.orange (already contrast-adjusted).
- NEVER use #fff, #ffffff, or any light color for text, titles, or labels.`);
  } else if (bgMode === 'chroma') {
    const hasGreen = customPalette && (_isGreenish(customPalette.accent) || _isGreenish(customPalette.green));
    const chromaColor = hasGreen ? 'blue (#0000FF)' : 'green (#00FF00)';
    parts.push(`CHROMA KEY MODE: Background is solid ${chromaColor} for chroma keying. DO NOT use ${hasGreen ? 'blue' : 'green'} or similar colors in ANY visual element.`);
  } else if (bgMode === 'alpha') {
    parts.push('ALPHA/TRANSPARENT MODE: Background is transparent (C.bg = "transparent"). The video will be rendered with alpha channel (ProRes 4444). DO NOT add any full-screen background elements. Cards and content will float over the video in Premiere Pro. Use C.card for card backgrounds (semi-transparent dark). Text should be white (C.text) for readability over any video.');
  }
  return parts.length ? '\n## ACTIVE PALETTE\n' + parts.join('\n') : '';
}

function _componentName(compositionId) {
  const n = compositionId.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return /^\d/.test(n) ? 'M' + n : n;
}

// ── Type-specific layout guidance ────────────────────────────────────────────

const LAYOUT_HINTS = {
  title: 'Hero layout: large title text dominates. Optional subtitle below.',
  list: 'Title at top, then items stacked vertically. Each item: icon + text on one line.',
  steps: 'Show ONE step per section. Number + title + description. Progress through sections.',
  cards: '2-3 cards in a row. Each card: icon + title + short description.',
  metrics: 'Big number (100-160px) as hero. Supporting label below. The number IS the design.',
  chart: 'Progress bars or proportional shapes with labels.',
  comparison: 'Two columns side by side. Left vs right with clear labels.',
  diagram: 'Connected concepts with arrows. Use flexbox row with arrow elements between.',
  timeline: 'Horizontal flow: nodes connected by lines. One node highlighted.',
  reveal: 'Progressive disclosure across sections. Each section adds to the story.',
  callout: 'One key phrase, large and prominent. Source/context smaller below.',
  icons: '3-4 icons in a row with labels below each.',
  funnel: 'Stacked bars getting narrower. Labels on each.',
  beforeafter: 'Two panels side by side. Left=before, right=after.',
};


// ── Context block builder ────────────────────────────────────────────────────

function _buildContextBlock(contextSummary, segmentContext) {
  if (!contextSummary && !segmentContext) return '';
  const parts = ['## Video Context'];
  if (contextSummary) {
    parts.push('This video is about: ' + contextSummary);
  }
  if (segmentContext) {
    if (segmentContext.context) parts.push('What came before: ' + segmentContext.context);
    if (segmentContext.keyMessage) parts.push('Key message of this segment: ' + segmentContext.keyMessage);
    if (segmentContext.narrativeRole) parts.push('Role in narrative: ' + segmentContext.narrativeRole);
  }
  parts.push('');
  return parts.join('\n') + '\n';
}

// ── Main prompt builder ──────────────────────────────────────────────────────

function getStaticLayoutPrompt({ transcriptSegment, type, description, durationFrames, compositionId, customPalette, paletteCategory, bgMode, contextSummary, segmentContext, timingPrompt }) {
  const compName = _componentName(compositionId);
  const layoutHint = LAYOUT_HINTS[type] || LAYOUT_HINTS.title;
  const durationSecs = (durationFrames / 30).toFixed(1);
  const numSections = durationFrames <= 240 ? 1 : durationFrames <= 450 ? 2 : durationFrames <= 600 ? 3 : Math.min(6, Math.ceil(durationFrames / 210));

  const systemMsg = `You are a motion graphics designer for educational videos. Your graphics appear OVER a professor's video. The viewer sees your graphic for a few seconds while listening.

YOUR JOB: Design clean, readable layouts using React + inline styles. The animation system handles all motion — you NEVER write animation code.

${DESIGN_SYSTEM}

## CRITICAL RULES (violation = rejected)

1. **NO position:absolute** inside <Safe>. Use ONLY flexbox (flexDirection, gap, margin, padding)
2. **NO individual words as separate elements**. "¿Qué es Git?" is ONE <div>, not three
3. **NO overriding Safe's alignment**. Do not pass style={{alignItems:'flex-start'}} to Safe
4. **MAX 5 animated elements per section** (title + subtitle + 2-3 content items)
5. **Complete sentences only**. Every text element must be a readable phrase
6. **NO background decorative text** (no giant dim words as texture)
7. **NO overlapping elements**. Flexbox prevents this naturally
8. **ALL text must be readable**: min fontSize 24px, color C.text or C.accent (not C.dim for important text)
9. Language: SAME language as the transcript
10. Fix any typos from the transcript

## HOW ANIMATION WORKS

Wrap elements with <Anim> to animate them. You NEVER write useCurrentFrame(), interpolate(), or spring().

Available types:
- <Anim type="fade-up" delay={0}>   — slides up + fades in (DEFAULT, best for most elements)
- <Anim type="fade-down" delay={5}>  — slides down + fades in
- <Anim type="fade-left" delay={10}> — slides from left
- <Anim type="fade-right" delay={15}> — slides from right
- <Anim type="pop" delay={20}>      — scales in (good for numbers, icons)
- <Anim type="fade" delay={25}>     — simple opacity fade (good for backgrounds)

Stagger delays by 8-12 frames between elements. All elements should be visible within 36 frames.
IMPORTANT: Once an element appears, it STAYS on screen. Elements do NOT disappear — they persist until the Section ends.
This means the viewer always has something to read. No blank time.

## SECTIONS (CRITICAL — no dead time!)

Use <Section from={startFrame} dur={durationInFrames}> to create sequential visual "slides":
- Each Section fades in, holds content visible, then fades out
- ALL content inside a Section remains visible for the Section's FULL duration
- Content inside uses <Anim> for element-level entrance stagger (elements appear progressively but NEVER disappear)
- Sections MUST cover the ENTIRE composition duration with NO GAPS:
  - Section 1 starts at from={0}
  - Each Section starts immediately when the previous one ends
  - Last Section must extend to the end of the composition
  - Example for ${durationFrames} frames with ${numSections} sections: each ≈ ${Math.round(durationFrames / numSections)} frames
- There should be NO dead time (blank frames with nothing visible)
- Overlap by ~15 frames between sections is OK (cross-fade effect)

This composition needs ${numSections} section(s) covering all ${durationFrames} frames.`;

  const userMsg = `Design a layout for this ${durationSecs}s motion graphic (${durationFrames} frames at 30fps).

\`\`\`tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
// Import icons as needed:
// import { Zap, ArrowRight, CheckCircle } from 'lucide-react';

${_buildPaletteCode(customPalette, bgMode)}

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,
    display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
    ...style}}>
    {children}
  </div>
);

// Animation wrapper — you just set type + delay, engine handles the rest
declare const Anim: React.FC<{type?:string; delay?:number; children:React.ReactNode; style?:React.CSSProperties}>;
// Section wrapper — sequential "slides" with auto fade in/out  
declare const Section: React.FC<{from:number; dur:number; children:React.ReactNode}>;

// ═══ EXAMPLE: Single-section layout (for clips < 8s) ═══
//
// const Layout1:React.FC = () => (
//   <Safe>
//     <Anim type="pop" delay={0}>
//       <div style={{fontSize:64,fontWeight:700,color:C.accent,textAlign:'center'}}>
//         Key Concept Title
//       </div>
//     </Anim>
//     <Anim type="fade-up" delay={10}>
//       <div style={{fontSize:28,color:C.text,textAlign:'center',marginTop:16,maxWidth:800}}>
//         One sentence explaining the concept clearly
//       </div>
//     </Anim>
//     <Anim type="fade-up" delay={20}>
//       <div style={{display:'flex',gap:24,marginTop:32}}>
//         <div style={{background:C.card,borderRadius:12,padding:'16px 24px',fontSize:24,color:C.text}}>
//           Detail 1
//         </div>
//         <div style={{background:C.card,borderRadius:12,padding:'16px 24px',fontSize:24,color:C.text}}>
//           Detail 2
//         </div>
//       </div>
//     </Anim>
//   </Safe>
// );

// ═══ EXAMPLE: Multi-section layout (for clips > 8s) ═══
//
// const Slide1:React.FC = () => (
//   <Safe>
//     <Anim type="pop" delay={0}>
//       <div style={{fontSize:64,fontWeight:700,color:C.accent,textAlign:'center'}}>Title</div>
//     </Anim>
//     <Anim type="fade-up" delay={10}>
//       <div style={{fontSize:28,color:C.text,textAlign:'center',marginTop:16}}>Explanation</div>
//     </Anim>
//   </Safe>
// );
// const Slide2:React.FC = () => (
//   <Safe>
//     <Anim type="fade-up" delay={0}>
//       <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center'}}>Next Point</div>
//     </Anim>
//   </Safe>
// );

export const ${compName}:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    {/* Single section: just render layout directly */}
    {/* Multi-section: <Section from={0} dur={150}><Slide1/></Section> */}
    {/*                <Section from={150} dur={150}><Slide2/></Section> */}
  </AbsoluteFill>
);
\`\`\`
${_paletteNote(customPalette, paletteCategory, bgMode)}

${_buildContextBlock(contextSummary, segmentContext)}
## Composition Details
- Export: ${compName}
- Duration: ${durationFrames} frames (${durationSecs}s)
- Sections needed: ${numSections}
- Type: ${type} — ${layoutHint}
- Description: ${description}

## Transcript (this specific segment)
${transcriptSegment}
${timingPrompt ? '\n' + timingPrompt + '\n' : ''}
## YOUR TASK
1. Read the transcript. Extract the KEY MESSAGE (1-2 sentences max)
2. Design ${numSections} section(s) that present this message clearly
3. Each section: title + supporting content, max 5 <Anim> elements
4. Use flexbox layout ONLY (no position:absolute inside Safe)
5. Text as complete, readable phrases
6. Output ONLY the TSX code — no explanations

Available logos (public/logos/): meta.svg, facebook.svg, instagram.svg, whatsapp.svg, google.svg, youtube.svg, tiktok.svg, linkedin.svg, twitter.svg, slack.svg, telegram.svg, github.svg, apple.svg, microsoft.svg, amazon.svg, netflix.svg, spotify.svg, pinterest.svg, snapchat.svg
Use: <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />`;

  return { systemMsg, userMsg };
}

module.exports = { getStaticLayoutPrompt };
