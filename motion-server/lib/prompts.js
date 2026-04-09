/**
 * Prompts for Motion-Pro LLM generation
 * Loads from centralized Prompts/MotionPro/ folder, falls back to local lib/
 */
const fs = require('fs');
const path = require('path');

const LIB_DIR = __dirname;
const PROMPTS_DIR = path.resolve(__dirname, '..', '..', 'Prompts', 'MotionPro');

function _loadDoc(centralName, localFallback) {
  const centralPath = path.join(PROMPTS_DIR, centralName);
  if (fs.existsSync(centralPath)) {
    return fs.readFileSync(centralPath, 'utf8');
  }
  const localPath = path.join(LIB_DIR, localFallback);
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath, 'utf8');
  }
  console.warn(`[prompts] Missing: ${centralName} and ${localFallback}`);
  return '';
}

const SYSTEM_PROMPT_DOC = _loadDoc('system.md', 'SYSTEM_PROMPT.md');
const STYLE_GUIDE_DOC = _loadDoc('style-guide.md', 'STYLE_GUIDE.md');
const DESIGN_FUNDAMENTALS_DOC = _loadDoc('design-fundamentals.md', 'DESIGN_FUNDAMENTALS.md');
const COMPANY_DESIGN_SYSTEM = _loadDoc('company-design-system.md', '');
const AVAILABLE_PACKAGES = _loadDoc('available-packages.md', '');
const QUALITY_RULES = _loadDoc('quality-rules.md', '');
const AUDIO_CUES = _loadDoc('audio-cues.md', '');

// Load templates
function _loadTemplates() {
  const templatesDir = path.join(PROMPTS_DIR, 'templates');
  if (!fs.existsSync(templatesDir)) return '';
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md')).sort();
  return files.map(f => fs.readFileSync(path.join(templatesDir, f), 'utf8')).join('\n\n---\n\n');
}
const TEMPLATES = _loadTemplates();

const FULL_SYSTEM_PROMPT = [
  SYSTEM_PROMPT_DOC,
  '\n\n---\n\n# Style Guide\n\n',
  STYLE_GUIDE_DOC,
  '\n\n---\n\n# Design Fundamentals\n\n',
  DESIGN_FUNDAMENTALS_DOC,
  COMPANY_DESIGN_SYSTEM ? '\n\n---\n\n# COMPANY DESIGN SYSTEM (OVERRIDES ALL ABOVE)\n\n' + COMPANY_DESIGN_SYSTEM : '',
  AVAILABLE_PACKAGES ? '\n\n---\n\n# AVAILABLE PACKAGES (USE THESE)\n\n' + AVAILABLE_PACKAGES : '',
  TEMPLATES ? '\n\n---\n\n# REFERENCE TEMPLATES (follow these patterns)\n\n' + TEMPLATES : '',
  QUALITY_RULES ? '\n\n---\n\n# QUALITY RULES (MUST FOLLOW)\n\n' + QUALITY_RULES : '',
  AUDIO_CUES ? '\n\n---\n\n# AUDIO CUES\n\n' + AUDIO_CUES : '',
].join('');

function _componentName(compositionId) {
  let name = compositionId
    .split(/[-_]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
  if (/^\d/.test(name)) name = 'M' + name;
  return name;
}

const TYPE_INSTRUCTIONS = {
  comparison: `Create a COMPARISON visual (A vs B, MULTI-SECTION):
- Section 1: First card enters from left with its content
- Section 2: "VS" badge appears in center
- Section 3: Second card enters from right
- Each card: 500-620px wide, C.card background, border-radius 12px
- Card headers with lucide-react icon + accent color, body with comparison points
- Use different accent colors (C.accent vs C.orange)
- Use TransitionSeries or staggered Sequences for the 3-part reveal`,

  steps: `Create a STEP/PROGRESS animation (MULTI-SECTION):
- Show ONE step at a time, centered, with a lucide-react icon (60-80px)
- Progress dots on one side showing all steps (active=filled, completed=dim, pending=empty)
- Each step gets its own <Sequence> block with fade transition between them
- Use TransitionSeries with fade() for smooth step-to-step transitions
- Active step: border + boxShadow glow, fontWeight 700
- Stagger elements within each step: 12-15 frames
- 3-5 steps typical, each step lasts 90-150 frames (3-5 seconds)`,

  icons: `Create an ICON REVEAL animation (2-4 items):
- 2-4 items displayed horizontally with gap: 140-160px
- Each item: circle background (180-220px), SVG geometric icon inside (100-140px)
- Label below each icon: 20-24px, fontWeight 700
- Items enter with stagger: 12-15 frames between each
- Use different accent colors per icon`,

  chart: `Create a CHART animation:
- Bar chart OR line chart based on the data
- Bar charts: max height 480px, width per bar 100-140px, spring stagger 8-10 frames
- Line charts: max width 1100px, marginLeft 100px, draw animation 120-150 frames
- ALWAYS include axis labels (X and Y)
- Title: 30-42px, marginBottom 60px minimum
- Values shown above bars or at data points`,

  title: `Create a TITLE/INTRO screen:
- Large centered SVG icon (100-140px) at top
- Title: 56-64px, fontWeight 700
- Subtitle: 24-28px, fontWeight 400, color C.dim
- Decorative separator line: 50px wide, 2px height, accent color
- Elements enter with stagger from center (pop animation)`,

  cards: `Create a CARD LAYOUT (horizontal flow):
- 2-3 cards arranged horizontally with SVG arrows between them
- Each card: 500-620px wide, C.card background, solid border
- Arrow connectors: SVG paths between cards
- Line placeholders (3-4px height bars) for long text
- Cards enter with stagger from left to right`,

  diagram: `Create a FLOW DIAGRAM (MULTI-SECTION):
- Flow boxes: 480-560px wide, connected by arrows using lucide-react ArrowRight
- Use flexbox layout, NOT absolute positioning
- PROGRESSIVE REVEAL: show one element at a time, each in its own Sequence
- Section 1: first box appears. Section 2: arrow + second box. Section 3: arrow + third box.
- Connection arrows appear WITH the next box, not before
- Use TransitionSeries with fade() between stages
- Each stage lasts 120-180 frames (4-6 seconds)`,

  ui: `Create a UI MOCKUP animation:
- Show ONLY the relevant UI element per section, centered
- Form width: max 540-600px, input heights: 58-62px
- Typing animation: substring with interpolate over 30-40 frames
- Active field: accent border + subtle glow
- Line placeholders for body text (3-4px bars, decreasing width/opacity)
- Generic data: "John Doe", "john@email.com"
- NO full browser chrome — just the isolated element`,

  timeline: `Create a TIMELINE animation (MULTI-SECTION, sequential events):
- Horizontal line as the spine with progressive draw-on (interpolate width from 0 to 100%)
- 3-6 nodes along the line, each appearing as the line reaches them
- Each node: circle (80-100px) with lucide-react icon + label below
- Each node gets its own Sequence block, timed to when the narrator mentions that event
- Line grows continuously while nodes pop in at the right moment
- This type is NATURALLY LONG — let it span the full narration duration`,

  reveal: `Create a REVEAL/DRAW-ON animation:
- Use @remotion/paths evolvePath to draw SVG paths progressively
- Main concept revealed through animated path tracing
- Can reveal text character by character (typing effect)
- Or reveal a diagram/icon by drawing its strokes
- Use Trail from @remotion/motion-blur for cinematic feel on moving elements
- Background elements can use noise2D from @remotion/noise for subtle organic movement`,

  list: `Create an ANIMATED LIST (vertical items):
- 3-8 items stacked vertically, each entering from bottom with stagger
- Each item: lucide-react icon (40px) + text label, aligned left
- Use TransitionSeries so items flow in smoothly
- Optional: number/bullet before each item
- Items can have a subtle highlight bar that fills as the narrator mentions them
- Use Rect from @remotion/shapes for highlight backgrounds`,

  metrics: `Create a METRICS/KPI dashboard:
- 2-4 big numbers displayed prominently
- Each metric: large number (72-96px) counting up with interpolate + label below
- Use Circle or Pie from @remotion/shapes for circular progress indicators
- Optional trend arrow (lucide-react TrendingUp/TrendingDown)
- Numbers animate from 0 to final value over 30-40 frames
- Cards with C.card background, border-radius 12px, subtle glow`,
};

function getGenerationPrompt({ transcriptSegment, type, description, durationFrames, compositionId, brandfetchKey }) {
  const systemMsg = FULL_SYSTEM_PROMPT;

  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const compName = _componentName(compositionId);

  const logoInstructions = brandfetchKey ? `
## Brand Logos (ENABLED)
When the transcript mentions a known brand/company/app (Google, Telegram, WhatsApp, Slack, etc.):
- Use Remotion's <Img> component to load the official logo
- URL pattern: https://cdn.brandfetch.io/{domain}?c=${brandfetchKey}&theme=dark&type=icon
- Import: import { Img } from 'remotion';
- Size: standalone logo 80-120px, inside card 40-60px, in list 32-40px
- Style: objectFit:'contain', no background needed (logos come with transparency)
- Common domains: google.com, telegram.org, whatsapp.com, slack.com, github.com, facebook.com, instagram.com, youtube.com, twitter.com, linkedin.com, apple.com, microsoft.com, amazon.com, netflix.com, spotify.com
- If unsure of the domain, use a lucide-react icon instead` : `
## Brand Logos (NOT CONFIGURED)
Do NOT attempt to load brand logos via URL. Use lucide-react icons for all visual elements.`;


  const userMsg = `Generate a Remotion composition. You MUST start from this exact template and fill in the sections:

\`\`\`tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
// Import icons as needed from lucide-react (see available-packages.md for full list)
// import { Shield, Lock, Key, Globe, Server, Database, CheckCircle, ArrowRight } from 'lucide-react';
// Import transitions if using TransitionSeries
// import { TransitionSeries, linearTiming } from '@remotion/transitions';
// import { fade } from '@remotion/transitions/fade';

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', green:'#0ae98d',
  orange:'#fb923c', purple:'#a78bfa', red:'#f87171', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(10,233,141,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:\`translate(\${x}px,\${y}px) scale(\${sc})\`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

// === YOUR SECTIONS GO HERE ===

export const ${compName}:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      {/* Sequence blocks go here */}
    </AbsoluteFill>
  );
};
\`\`\`

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

## MULTI-SECTION STRUCTURE (IMPORTANT)
- This composition should have MULTIPLE internal sections that evolve with the narration
- Each section = one <Sequence> or one part of a <TransitionSeries>
- Use fade() transitions between sections for smooth visual flow
- Each section should have NEW visual content (not just the same elements staying static)
- Think of this as a MINI FILM that tells a visual story alongside the narrator
- Minimum 2-3 sections for clips under 15s, 3-5 sections for clips 15-30s

## MANDATORY RULES (violation = rejected)
1. Start from the EXACT template above — keep ALL imports, C palette, Safe, E, Fd components exactly as shown
2. The AbsoluteFill MUST have style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}
3. ALL text elements must use fontFamily:"'DM Sans',sans-serif" — this is the CORPORATE FONT, never use IBM Plex Sans
4. ALL content must be inside <Safe> wrapper — NOTHING may exit the safe zone
5. Use <Sequence from={frame} durationInFrames={dur}> — frame 0 is the START of this clip, NOT the absolute timeline time. If the transcript says [30.0s - 45.0s], that maps to frames 0-450 in your composition. Calculate: frame = (transcriptTime - clipStartTime) * 30
6. Last section uses <Fd dur={X} fi={10} fo={1}> so it stays visible
7. Colors: ONLY from const C — never invent colors
8. Min font size: 24px. Weights: 400 or 700 only
9. NO Audio, NO Html5Audio, NO staticFile — this is visual-only
10. NO grid/pattern background — solid C.bg only
11. Icons: ALWAYS use lucide-react icons (import from 'lucide-react'). NEVER draw SVG manually. Size: 60-100px for main icons
12. Elements must fill 70%+ of the safe area (1600×740px usable)
13. Use @remotion/shapes for geometric elements (Circle, Rect, Triangle, Star) instead of manual SVG
14. Consider @remotion/transitions (TransitionSeries + fade/slide) for smooth section transitions
15. LANGUAGE: All text in the composition must be in the SAME LANGUAGE as the transcript. If transcript is in English, all labels/titles/text must be in English. If Spanish, in Spanish.

Output the COMPLETE TSX file. No explanations before or after the code.`;

  return { systemMsg, userMsg };
}

function getFeedbackPrompt({ currentTsx, feedback, compositionId, type, description }) {
  const systemMsg = FULL_SYSTEM_PROMPT;

  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const compName = _componentName(compositionId);

  const userMsg = `The user wants SPECIFIC CHANGES to this Remotion composition. Read their feedback carefully and apply exactly what they ask.

## User Feedback (THIS IS YOUR #1 PRIORITY — apply these changes)
${feedback}

## Animation Type: ${type}
${description ? 'Description: ' + description : ''}

## Type Rules (maintain these unless feedback contradicts)
${typeGuide}

## Current Code (modify this file)
\`\`\`tsx
${currentTsx}
\`\`\`

## Mandatory after modifications
1. **APPLY THE FEEDBACK FIRST** — everything else is secondary to what the user asked
2. Export as \`${compName}\`
3. Keep the template structure: imports, C palette, Safe, E, Fd components inline
4. The AbsoluteFill MUST have fontFamily:"'DM Sans',sans-serif"
5. ALL text must use fontFamily:"'DM Sans',sans-serif" — corporate font
6. ALL content inside <Safe> — nothing outside safe zone
7. Background: solid C.bg only. NO audio. Colors from C only.
8. Spring config: {damping:14, mass:0.4} as defined in the design docs
9. Keep same timing/duration unless feedback changes it
10. Frame 0 = start of clip. Sections are RELATIVE to frame 0, not absolute timeline time

Output the COMPLETE modified TSX file. No explanations.`;

  return { systemMsg, userMsg };
}

function getTypeInstructions() {
  return Object.entries(TYPE_INSTRUCTIONS).map(([key, val]) => `### ${key}\n${val}`).join('\n\n');
}

module.exports = { getGenerationPrompt, getFeedbackPrompt, getTypeInstructions };
