/**
 * Static Layout Prompt — LLM generates ONLY layout + styling (no animation code).
 * The animation engine (Anim wrapper) handles all motion automatically.
 *
 * Architecture:
 * 1. LLM outputs a single React component with static JSX + inline styles
 * 2. Each element uses data-anim="type" and data-delay="N" attributes
 * 3. The Anim wrapper reads these attributes and applies frame-based animations
 * 4. Remotion renders the result as video
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

function _buildPaletteCode(customPalette) {
  const p = customPalette ? (validatePalette(customPalette) || DEFAULT_PALETTE) : DEFAULT_PALETTE;
  return `const C = {
  bg:'${p.bg}', card:'${p.card}', accent:'${p.accent}', green:'${p.green}',
  orange:'${p.orange}', purple:'${p.purple}', red:'${p.red}', text:'${p.text}',
  dim:'${p.dim}', border:'${p.border}',
  glow:'${p.glow}',
};`;
}

function _paletteNote(customPalette, paletteCategory) {
  const parts = [];
  if (paletteCategory && paletteCategory !== 'auto') {
    const desc = getCategoryDescription(paletteCategory);
    if (desc) parts.push(`Visual style: ${desc}`);
  }
  if (customPalette) {
    const p = validatePalette(customPalette);
    if (p) parts.push(`Custom palette — bg: ${p.bg}, accent: ${p.accent}, card: ${p.card}. Use these colors.`);
  }
  return parts.length ? '\n## ACTIVE PALETTE\n' + parts.join('\n') : '';
}

// ── Component name helper ────────────────────────────────────────────────────

function _componentName(compositionId) {
  const n = compositionId.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  return /^\d/.test(n) ? 'M' + n : n;
}

// ── Type-specific layout guidance ────────────────────────────────────────────

const LAYOUT_HINTS = {
  title: 'Hero layout: large title text dominates. Optional icon above or beside. Subtitle below. Think editorial cover.',
  list: 'Title at top, then items stacked vertically. Each item: icon/number + text. Items should feel like a designed list, not bullet points.',
  steps: 'Sequential steps — show numbered progression. Each step: number + title + optional description. Linear flow, clear hierarchy.',
  cards: 'Card-based layout. 2-3 cards with distinct content. Cards have borders, subtle backgrounds. Not all the same size — vary for hierarchy.',
  metrics: 'Big number(s) as hero. Supporting context text smaller. The number IS the design — make it massive (100-180px).',
  chart: 'Visual data representation. Bars, progress indicators, or proportional shapes. Labels clear and readable.',
  comparison: 'Two sides — left vs right, or before/after. Clear visual separation. Different accent colors per side.',
  diagram: 'Connected concepts. Arrows or lines between elements. Flow from one idea to another.',
  timeline: 'Horizontal or vertical progression through time. Nodes connected by a line. Active node highlighted.',
  reveal: 'Progressive disclosure — elements appear in sequence to build a complete picture.',
  callout: 'One key phrase or quote, large and prominent. Attribution or context smaller below.',
  icons: 'Icon-centric layout. Large icons with labels. The icons tell the story.',
  funnel: 'Narrowing stages from top to bottom. Each stage smaller than the previous.',
  beforeafter: 'Two-panel comparison. Left = before state, right = after state. Visual contrast between them.',
};

// ── Main prompt builder ──────────────────────────────────────────────────────

function getStaticLayoutPrompt({ transcriptSegment, type, description, durationFrames, compositionId, customPalette, paletteCategory }) {
  const compName = _componentName(compositionId);
  const layoutHint = LAYOUT_HINTS[type] || LAYOUT_HINTS.title;
  const durationSecs = (durationFrames / 30).toFixed(1);

  const systemMsg = `You are a motion graphics designer for educational videos. You create STATIC LAYOUTS — the animation system handles all motion automatically.

YOUR JOB: Design a beautiful, editorial-quality layout using React + inline styles. NO animation code.

${DESIGN_SYSTEM ? '## DESIGN PHILOSOPHY\n' + DESIGN_SYSTEM + '\n\n' : ''}

## HOW ANIMATION WORKS (you don't write this code)
Wrap elements with the <Anim> component to animate them:
- <Anim type="fade-up" delay={0}>...</Anim> — fades in + slides up
- <Anim type="fade-left" delay={3}>...</Anim> — fades in + slides from left
- <Anim type="fade-right" delay={6}>...</Anim> — fades in + slides from right
- <Anim type="pop" delay={9}>...</Anim> — scales in with bounce
- <Anim type="fade" delay={12}>...</Anim> — simple opacity fade

The \`delay\` is in frames (30fps). Stagger elements by 4-8 frames.
The Anim component handles entrance timing, easing, and fade-out automatically.
You NEVER write useCurrentFrame(), interpolate(), spring(), or any frame math.

## SECTIONS (for longer clips)
For clips longer than 5 seconds, split content into sections using <Section from={frame} dur={frames}>:
- Section 1: from=0, dur=150 (first 5 seconds)
- Section 2: from=150, dur=150 (next 5 seconds)
- etc.
Each Section handles its own entrance/exit. Content inside each Section uses Anim for element-level animation.

## RULES
1. ONLY use: C palette colors, DM Sans font (400/700), lucide-react icons, Img+staticFile for brand logos
2. ALL content inside <Safe> wrapper
3. Min font size: 24px. Hero text: 60-180px. Use dramatic size contrast.
4. Fill 70%+ of the safe area (1600×740px usable space)
5. Language: SAME as transcript
6. NO audio, NO external URLs, NO decorative clutter (stars, sparkles, floating dots)
7. Text must be READABLE — high contrast, sufficient size, clean layout
8. Every element serves the narrative — no decoration without purpose
9. Use gradients for depth: linear-gradient on cards, radial-gradient for glow accents
10. Fix typos from transcript in your text`;

  const userMsg = `Design a static layout for this motion graphic.

\`\`\`tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
// Import icons as needed:
// import { Zap, ArrowRight, CheckCircle } from 'lucide-react';

${_buildPaletteCode(customPalette)}

// Safe area wrapper (1600×740px usable)
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>
    {children}
  </div>
);

// Animation wrapper — handles all motion. You just specify type and delay.
// Types: "fade-up" | "fade-left" | "fade-right" | "fade-down" | "pop" | "fade"
// delay: frames to wait before animating in (stagger by 4-8 frames between elements)
declare const Anim: React.FC<{type?:string; delay?:number; children:React.ReactNode; style?:React.CSSProperties}>;

// Section wrapper — for multi-section compositions. Handles entrance/exit.
// from: start frame, dur: duration in frames
declare const Section: React.FC<{from:number; dur:number; children:React.ReactNode}>;

// ═══ YOUR LAYOUT BELOW ═══

// Design your sections here. Example structure:
// const Layout1:React.FC = () => (
//   <Safe>
//     <Anim type="pop" delay={0}>
//       <div style={{fontSize:72,fontWeight:700,color:C.text}}>Big Title</div>
//     </Anim>
//     <Anim type="fade-up" delay={8}>
//       <div style={{fontSize:28,color:C.dim,marginTop:20}}>Subtitle text</div>
//     </Anim>
//   </Safe>
// );

export const ${compName}:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    {/* For short clips (< 8s): single layout, no Section wrapper needed */}
    {/* For longer clips: use <Section from={0} dur={150}><Layout1/></Section> */}
  </AbsoluteFill>
);
\`\`\`
${_paletteNote(customPalette, paletteCategory)}

## Composition Details
- Export name: ${compName}
- Duration: ${durationFrames} frames (${durationSecs}s)
- Type: ${type}
- Layout hint: ${layoutHint}
- Description: ${description}

## Transcript
${transcriptSegment}

## WHAT TO OUTPUT
- The COMPLETE TSX file with your layout
- Use <Anim> on every element that should animate (basically everything)
- Stagger delays: first element delay=0, next delay=5, next delay=10, etc.
- For clips > 8s: use <Section> to split into 2-4 visual sections
- For clips < 8s: single layout without Section wrapper
- The design should be EXPRESSIVE and UNIQUE — not a generic slide
- Think editorial design, magazine layouts, asymmetric tension
- ONLY output the TSX code, no explanations

Available brand logos (in public/logos/): meta.svg, facebook.svg, instagram.svg, whatsapp.svg, google.svg, youtube.svg, tiktok.svg, linkedin.svg, twitter.svg, slack.svg, telegram.svg, github.svg, apple.svg, microsoft.svg, amazon.svg, netflix.svg, spotify.svg, pinterest.svg, snapchat.svg
Use: <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />`;

  return { systemMsg, userMsg };
}

module.exports = { getStaticLayoutPrompt };
