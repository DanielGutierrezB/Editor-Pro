/**
 * Prompts for Motion-Pro LLM generation
 * v1.0.33 — Dynamic prompt: only sends relevant components per animation type
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
  if (localFallback) {
    const localPath = path.join(LIB_DIR, localFallback);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath, 'utf8');
    }
  }
  console.warn(`[prompts] Missing: ${centralName}`);
  return '';
}

const SYSTEM_PROMPT_DOC = _loadDoc('system.md', 'SYSTEM_PROMPT.md');
const AVAILABLE_PACKAGES = _loadDoc('available-packages.md', '');
const QUALITY_RULES = _loadDoc('quality-rules.md', '');

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
  AVAILABLE_PACKAGES ? '\n\n---\n\n# AVAILABLE PACKAGES (USE THESE)\n\n' + AVAILABLE_PACKAGES : '',
  TEMPLATES ? '\n\n---\n\n# REFERENCE TEMPLATES (follow these patterns)\n\n' + TEMPLATES : '',
  QUALITY_RULES ? '\n\n---\n\n# QUALITY RULES (MUST FOLLOW)\n\n' + QUALITY_RULES : '',
].join('');

// ──────────────────────────────────────────────────────────────────────────────
// Dynamic system prompt — strip Section 1.13 for types that don't need it
// ──────────────────────────────────────────────────────────────────────────────

const ADVANCED_TECHNIQUE_TYPES = new Set(['metrics', 'gauge', 'reveal', 'icons', 'list']);

function buildSystemPrompt(type) {
  if (ADVANCED_TECHNIQUE_TYPES.has(type)) {
    return FULL_SYSTEM_PROMPT; // needs CascadeItem, OdometerDigit, MorphPosition docs
  }
  // Strip Section 1.13 (Advanced Animation Techniques) — ~150 lines of examples
  return FULL_SYSTEM_PROMPT.replace(
    /### 1\.13 Advanced Animation Techniques[\s\S]*?(?=\n---\n\n## SECTION 2)/,
    ''
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Component definitions for the code template
// Base components (C, Safe, E, Fd) are ALWAYS included.
// These advanced components are selected per animation type.
// NOTE: These strings contain TSX code with template literals — backticks
// and ${} are literal characters (not JS interpolation).
// ──────────────────────────────────────────────────────────────────────────────

const COMP_DEFS = {
  AnimatedText: [
    'const AnimatedText:React.FC<{',
    '  text:string;',
    '  d:number;',
    '  fontSize?:number;',
    '  fontWeight?:number;',
    '  color?:string;',
    "  align?:'left'|'center'|'right';",
    "  mode?:'word'|'line'|'fade';",
    '  framesPerWord?:number;',
    "}> = ({text, d, fontSize=36, fontWeight=700, color=C.text, align='center', mode='word', framesPerWord=4}) => {",
    '  const frame = useCurrentFrame();',
    "  const words = text.split(' ');",
    '  ',
    "  if (mode === 'fade') {",
    '    const progress = interpolate(frame - d, [0, 25], [0, 1], {',
    '      easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '    });',
    '    return (',
    '      <div style={{fontSize, fontWeight, color, textAlign:align, opacity:progress, ',
    '        transform:`translateY(${interpolate(progress,[0,1],[30,0])}px)`}}>',
    '        {text}',
    '      </div>',
    '    );',
    '  }',
    '  ',
    '  return (',
    "    <div style={{fontSize, fontWeight, textAlign:align, display:'flex', flexWrap:'wrap', ",
    "      justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',",
    '      gap: `0 ${fontSize * 0.3}px`}}>',
    '      {words.map((word, i) => {',
    '        const wordDelay = d + i * framesPerWord;',
    '        const progress = interpolate(frame - wordDelay, [0, 12], [0, 1], {',
    '          easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '        });',
    '        return (',
    '          <span key={i} style={{',
    '            color,',
    '            opacity: progress,',
    '            transform: `translateY(${interpolate(progress, [0,1], [20, 0])}px)`,',
    "            display: 'inline-block',",
    '          }}>',
    '            {word}',
    '          </span>',
    '        );',
    '      })}',
    '    </div>',
    '  );',
    '};',
  ].join('\n'),

  GlowCard: [
    'const GlowCard:React.FC<{',
    '  children:React.ReactNode;',
    '  d:number;',
    '  from?:string;',
    '  accent?:string;',
    '  elevation?:1|2|3|4;',
    "  width?:number|string;",
    '  active?:boolean;',
    '  style?:React.CSSProperties;',
    "}> = ({children, d, from='up', accent=C.accent, elevation=2, width='auto', active=true, style}) => {",
    '  const frame = useCurrentFrame();',
    '  ',
    '  const shadows:{[key:number]:string} = {',
    "    1: '0 2px 8px rgba(0,0,0,0.3)',",
    "    2: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',",
    "    3: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',",
    '    4: `0 8px 32px ${accent}20, 0 0 60px ${accent}08, 0 0 0 1px ${accent}30`,',
    '  };',
    '',
    '  const glowIntensity = active ',
    "    ? interpolate(frame % 120, [0, 60, 120], [0.03, 0.06, 0.03], {extrapolateRight:'clamp', extrapolateLeft:'clamp'})",
    '    : 0;',
    '  ',
    '  return (',
    '    <E d={d} from={from} style={{width, ...style}}>',
    '      <div style={{',
    '        backgroundColor: C.card,',
    '        borderRadius: 16,',
    '        padding: 32,',
    '        border: active ? `1px solid ${accent}30` : `1px solid ${C.border}`,',
    '        boxShadow: shadows[active ? Math.max(elevation, 3) : elevation],',
    "        position: 'relative',",
    "        overflow: 'hidden',",
    '      }}>',
    '        {active && (',
    '          <div style={{',
    "            position: 'absolute', top: 0, left: 0, right: 0, height: 2,",
    '            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,',
    '            opacity: 0.6,',
    '          }}/>',
    '        )}',
    '        {active && (',
    '          <div style={{',
    "            position: 'absolute', top: -50, right: -50, width: 200, height: 200,",
    "            background: `radial-gradient(circle, ${accent}${Math.round(glowIntensity * 255).toString(16).padStart(2,'0')}, transparent 70%)`,",
    "            pointerEvents: 'none',",
    '          }}/>',
    '        )}',
    "        <div style={{position:'relative', zIndex:1}}>",
    '          {children}',
    '        </div>',
    '      </div>',
    '    </E>',
    '  );',
    '};',
  ].join('\n'),

  AnimatedLine: [
    'const AnimatedLine:React.FC<{',
    '  x1:number; y1:number; x2:number; y2:number;',
    '  d:number;',
    '  color?:string;',
    '  strokeWidth?:number;',
    '  dashed?:boolean;',
    '  duration?:number;',
    '}> = ({x1, y1, x2, y2, d, color=C.accent, strokeWidth=2, dashed=false, duration=30}) => {',
    '  const frame = useCurrentFrame();',
    '  const progress = interpolate(frame - d, [0, duration], [0, 1], {',
    '    easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '  });',
    '  ',
    '  const length = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));',
    '  ',
    '  return (',
    "    <svg style={{position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:0}}>",
    '      <line',
    '        x1={x1} y1={y1} x2={x2} y2={y2}',
    '        stroke={color}',
    '        strokeWidth={strokeWidth}',
    "        strokeDasharray={dashed ? '8 6' : `${length}`}",
    '        strokeDashoffset={dashed ? 0 : length * (1 - progress)}',
    '        strokeLinecap="round"',
    "        opacity={interpolate(progress, [0, 0.1], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})}",
    '      />',
    '      {progress > 0.8 && (',
    '        <circle',
    '          cx={interpolate(progress, [0,1], [x1, x2])}',
    '          cy={interpolate(progress, [0,1], [y1, y2])}',
    '          r={4}',
    '          fill={color}',
    "          opacity={interpolate(progress, [0.8, 1], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})}",
    '        />',
    '      )}',
    '    </svg>',
    '  );',
    '};',
  ].join('\n'),

  ProgressDots: [
    'const ProgressDots:React.FC<{',
    '  total:number;',
    '  current:number;',
    '  d:number;',
    '  accent?:string;',
    "  position?:'bottom'|'right';",
    "}> = ({total, current, d, accent=C.accent, position='bottom'}) => {",
    '  const frame = useCurrentFrame();',
    "  const isHorizontal = position === 'bottom';",
    '  ',
    '  return (',
    '    <E d={d} from="pop" style={{',
    "      position: 'absolute',",
    '      ...(isHorizontal ',
    "        ? {bottom: 60, left: '50%', transform: 'translateX(-50%)'}",
    "        : {right: 80, top: '50%', transform: 'translateY(-50%)'}",
    '      ),',
    '    }}>',
    '      <div style={{',
    "        display: 'flex',",
    "        flexDirection: isHorizontal ? 'row' : 'column',",
    '        gap: 12,',
    "        alignItems: 'center',",
    '      }}>',
    '        {Array.from({length: total}).map((_, i) => {',
    '          const isActive = i === current;',
    '          const isPast = i < current;',
    '          return (',
    '            <div key={i} style={{',
    '              width: isActive ? (isHorizontal ? 32 : 8) : 8,',
    '              height: isActive ? (isHorizontal ? 8 : 32) : 8,',
    '              borderRadius: 4,',
    "              backgroundColor: isActive ? accent : isPast ? `${accent}60` : 'rgba(255,255,255,0.15)',",
    "              transition: 'none',",
    '            }}/>',
    '          );',
    '        })}',
    '      </div>',
    '    </E>',
    '  );',
    '};',
  ].join('\n'),

  AccentSeparator: [
    'const AccentSeparator:React.FC<{',
    '  d:number;',
    '  width?:number;',
    '  color?:string;',
    "  variant?:'line'|'dots'|'gradient';",
    "}> = ({d, width=80, color=C.accent, variant='line'}) => {",
    '  const frame = useCurrentFrame();',
    '  const progress = interpolate(frame - d, [0, 25], [0, 1], {',
    '    easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '  });',
    '  ',
    "  if (variant === 'dots') {",
    '    return (',
    "      <div style={{display:'flex', gap:8, justifyContent:'center', opacity: progress}}>",
    '        {[0,1,2].map(i => (',
    '          <div key={i} style={{',
    '            width: 6, height: 6, borderRadius: 3,',
    '            backgroundColor: i === 1 ? color : `${color}40`,',
    '            transform: `scale(${interpolate(',
    '              frame - d - i * 5, [0, 15], [0, 1],',
    "              {easing: Easing.bezier(0.34, 1.56, 0.64, 1), extrapolateLeft:'clamp', extrapolateRight:'clamp'}",
    '            )})`,',
    '          }}/>',
    '        ))}',
    '      </div>',
    '    );',
    '  }',
    '  ',
    "  if (variant === 'gradient') {",
    '    return (',
    '      <div style={{',
    "        width: width * progress, height: 2, margin: '0 auto',",
    '        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,',
    '        borderRadius: 1,',
    '      }}/>',
    '    );',
    '  }',
    '  ',
    '  return (',
    '    <div style={{',
    '      width: width * progress, height: 2,',
    "      backgroundColor: color, borderRadius: 1, margin: '0 auto',",
    '    }}/>',
    '  );',
    '};',
  ].join('\n'),

  CascadeItem: [
    '// CascadeItem — stagger with blur (depth of field effect)',
    'const CascadeItem:React.FC<{d:number;index:number;children:React.ReactNode}> = ({d,index,children}) => {',
    '  const frame = useCurrentFrame();',
    '  const delay = d + index * 8;',
    '  const dist = 60 + index * 15;',
    '  const dur = 22 + index * 2;',
    '  const progress = interpolate(frame - delay, [0, dur], [0, 1], {',
    '    easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '  });',
    '  return (',
    '    <div style={{',
    '      opacity: progress,',
    '      transform: `translateY(${interpolate(progress,[0,1],[dist,0])}px)`,',
    '      filter: `blur(${interpolate(progress,[0,0.5,1],[4,1,0])}px)`,',
    '    }}>{children}</div>',
    '  );',
    '};',
  ].join('\n'),

  OdometerDigit: [
    '// OdometerDigit — number that counts up digit by digit',
    'const OdometerDigit:React.FC<{value:number;d:number;fontSize?:number;color?:string}> = ({value,d,fontSize=96,color=C.accent}) => {',
    '  const frame = useCurrentFrame();',
    '  const progress = interpolate(frame - d, [0, 40], [0, 1], {',
    '    easing: Easing.bezier(0.16, 1, 0.3, 1),',
    "    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '  });',
    '  const current = Math.round(interpolate(progress, [0,1], [0, value]));',
    "  const digits = String(current).split('');",
    '  return (',
    "    <div style={{display:'flex',overflow:'hidden',height:fontSize*1.2}}>",
    '      {digits.map((digit, i) => {',
    '        const dp = interpolate(frame - d - i*3, [0,30], [0,1], {',
    "          easing: Easing.bezier(0.16,1,0.3,1), extrapolateLeft:'clamp', extrapolateRight:'clamp',",
    '        });',
    "        return <div key={i} style={{fontSize,fontWeight:700,color,fontFamily:\"'DM Sans',sans-serif\",lineHeight:1.2,opacity:dp,",
    '          transform:`translateY(${interpolate(dp,[0,1],[fontSize*0.5,0])}px)`}}>{digit}</div>;',
    '      })}',
    '    </div>',
    '  );',
    '};',
  ].join('\n'),

  AnimatedMetric: [
    '// AnimatedMetric — number + suffix + label',
    "const AnimatedMetric:React.FC<{value:number;suffix:string;label:string;d:number;accent?:string}> = ({value,suffix,label,d,accent=C.accent}) => (",
    "  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>",
    "    <div style={{display:'flex',alignItems:'baseline',gap:4}}>",
    '      <OdometerDigit value={value} d={d} fontSize={96} color={accent}/>',
    '      <E d={d+15} from="pop"><span style={{fontSize:48,fontWeight:700,color:accent}}>{suffix}</span></E>',
    '    </div>',
    "    <E d={d+20} from=\"up\"><span style={{fontSize:22,fontWeight:400,color:C.dim,textTransform:'uppercase',letterSpacing:3}}>{label}</span></E>",
    '  </div>',
    ');',
  ].join('\n'),

  MorphPosition: [
    '// MorphPosition — element that smoothly repositions between phases',
    'const MorphPosition:React.FC<{children:React.ReactNode;phase:number;fromY:number;toY:number;fromX?:number;toX?:number;fromScale?:number;toScale?:number;d:number;duration?:number}> = ',
    '  ({children,phase,fromY,toY,fromX=0,toX=0,fromScale=1,toScale=1,d,duration=25}) => {',
    '  const frame = useCurrentFrame();',
    '  const mp = interpolate(frame - d, [0, duration], [0, phase], {',
    '    easing: Easing.bezier(0.45, 0, 0.55, 1),',
    "    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',",
    '  });',
    '  return (',
    "    <div style={{transform:`translate(${interpolate(mp,[0,1],[fromX,toX])}px,${interpolate(mp,[0,1],[fromY,toY])}px) scale(${interpolate(mp,[0,1],[fromScale,toScale])})`,transformOrigin:'center center'}}>",
    '      {children}',
    '    </div>',
    '  );',
    '};',
  ].join('\n'),
};

// ──────────────────────────────────────────────────────────────────────────────
// Type → component mapping (only advanced components; E, Fd, Safe, C always included)
// ──────────────────────────────────────────────────────────────────────────────

const TYPE_COMPONENTS = {
  title:       ['AnimatedText', 'AccentSeparator'],
  callout:     ['AnimatedText', 'AccentSeparator'],
  reveal:      ['AnimatedText', 'MorphPosition'],
  icons:       ['CascadeItem'],
  cards:       ['GlowCard', 'AnimatedLine'],
  diagram:     ['GlowCard', 'AnimatedLine'],
  steps:       ['GlowCard', 'ProgressDots'],
  chart:       ['AccentSeparator'],
  metrics:     ['GlowCard', 'OdometerDigit', 'AnimatedMetric', 'AccentSeparator'],
  gauge:       ['OdometerDigit', 'AnimatedMetric'],
  list:        ['CascadeItem', 'AccentSeparator'],
  comparison:  ['GlowCard'],
  beforeafter: ['GlowCard'],
  funnel:      ['GlowCard', 'ProgressDots'],
  timeline:    ['AnimatedLine', 'ProgressDots'],
  ui:          ['GlowCard'],
};

function _getComponentsForType(type) {
  const needed = TYPE_COMPONENTS[type] || [];
  // Deduplicate and resolve dependencies (AnimatedMetric needs OdometerDigit)
  const set = new Set(needed);
  if (set.has('AnimatedMetric') && !set.has('OdometerDigit')) set.add('OdometerDigit');
  // Build in definition order to respect dependencies
  const order = ['AnimatedText', 'GlowCard', 'AnimatedLine', 'ProgressDots', 'AccentSeparator', 'CascadeItem', 'OdometerDigit', 'AnimatedMetric', 'MorphPosition'];
  return order.filter(name => set.has(name)).map(name => COMP_DEFS[name]).join('\n\n');
}

// ──────────────────────────────────────────────────────────────────────────────

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
- Use staggered <Sequence> blocks for the 3-part reveal
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use GlowCard. Left card accent=C.red, right card accent=C.accent.`,

  steps: `Create a STEP/PROGRESS animation (MULTI-SECTION):
- Show ONE step at a time, CENTERED in the safe area
- Progress indicator (dots or numbers) at the bottom showing total steps
- Each step: centered card with icon (60-80px) + title + description
- Hard cut between steps (NO crossfade, NO diagonal movement)
- Previous steps DISAPPEAR completely — only current step + progress visible
- Active step: accent border + glow. Progress dots: filled for completed, empty for pending
- Each step lasts 90-150 frames (3-5 seconds)
- Fill 80%+ of safe area. NEVER leave more than 20% empty.
- Use GlowCard for active step, ProgressDots at bottom.
- CRITICAL: Each step's Sequence must have ZERO overlap with the next step's Sequence. If Step 1 is from=0 durationInFrames=120, Step 2 MUST start at from=120, NOT from=100. Overlapping Sequences cause text duplication artifacts.`,

  icons: `Create an ICON REVEAL animation (2-4 items):
- 2-4 items displayed horizontally with gap: 140-160px
- Each item: circle background (180-220px), SVG geometric icon inside (100-140px)
- Label below each icon: 20-24px, fontWeight 700
- Items enter with stagger: 12-15 frames between each
- Use different accent colors per icon
- Layout: horizontal row OR 2x2 grid using flexbox. NEVER place icons orbiting around a center element.
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Icon inside circle container with subtle glow border.`,

  chart: `Create a CHART animation:
- Bar chart OR line chart based on the data
- Bar charts: max height 480px, width per bar 100-140px, spring stagger 8-10 frames
- Line charts: max width 1100px, marginLeft 100px, draw animation 120-150 frames
- ALWAYS include axis labels (X and Y)
- Title: 30-42px, marginBottom 60px minimum
- Values shown above bars or at data points
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Bars animate with spring stagger. Use AccentSeparator between title and chart.`,

  title: `Create a TITLE/INTRO screen:
- Large centered SVG icon (100-140px) at top
- Title: 56-64px, fontWeight 700
- Subtitle: 24-28px, fontWeight 400, color C.dim
- Decorative separator line: 50px wide, 2px height, accent color
- Elements enter with stagger from center (pop animation)
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use AnimatedText for word-by-word reveal. Use AccentSeparator below title.`,

  cards: `Create a CARD LAYOUT (horizontal flow):
- 2-3 cards arranged horizontally with SVG arrows between them
- Each card: 500-620px wide, C.card background, solid border
- Arrow connectors: SVG paths between cards
- For long text: use SHORT labels (max 8-10 words), never gray placeholder bars
- Cards enter with stagger from left to right
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use GlowCard with different elevation levels. Active card = elevation 4.`,

  diagram: `Create a FLOW DIAGRAM (MULTI-SECTION):
- Flow boxes: 480-560px wide, connected by arrows using lucide-react ArrowRight
- Use flexbox layout, NOT absolute positioning
- PROGRESSIVE REVEAL: show one element at a time, each in its own Sequence
- Section 1: first box appears. Section 2: arrow + second box. Section 3: arrow + third box.
- Connection arrows appear WITH the next box, not before
- Use separate <Sequence> blocks for each stage with hard cuts between them
- Each stage lasts 120-180 frames (4-6 seconds)
- Use flexbox layout with gap, NOT absolute positioning for flow elements
- All elements must be vertically AND horizontally centered in the safe area
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use AnimatedLine for connections between nodes. GlowCard for active node.`,

  ui: `Create a UI MOCKUP animation:
- Show ONLY the relevant UI element per section, centered
- Form width: max 540-600px, input heights: 58-62px
- Typing animation: substring with interpolate over 30-40 frames
- Active field: accent border + subtle glow
- For body text: use SHORT descriptive text (max 8-10 words), never gray placeholder bars
- Generic data: "John Doe", "john@email.com"
- NO full browser chrome — just the isolated element
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.`,

  timeline: `Create a TIMELINE animation (MULTI-SECTION, sequential events):
- Horizontal line as the spine with progressive draw-on (interpolate width from 0 to 100%)
- 3-6 nodes along the line, each appearing as the line reaches them
- Each node: circle (80-100px) with lucide-react icon + label below
- Each node gets its own Sequence block, timed to when the narrator mentions that event
- Line grows continuously while nodes pop in at the right moment
- This type is NATURALLY LONG — let it span the full narration duration
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.`,

  reveal: `Create a REVEAL/DRAW-ON animation:
- Use @remotion/paths evolvePath to draw SVG paths progressively
- Main concept revealed through animated path tracing
- Can reveal text character by character (typing effect)
- Or reveal a diagram/icon by drawing its strokes
- Use opacity and scale transitions for reveals. DO NOT use @remotion/motion-blur Trail component (it's disabled).
- Background elements can use noise2D from @remotion/noise for subtle organic movement
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use AnimatedText mode='word' for progressive text reveal.`,

  list: `Create an ANIMATED LIST (vertical items):
- 3-8 items stacked vertically, each entering from bottom with stagger
- Each item: lucide-react icon (40px) + text label, aligned left
- Use staggered <Sequence> blocks so items flow in smoothly
- Optional: number/bullet before each item
- Items can have a subtle highlight bar that fills as the narrator mentions them
- Use Rect from @remotion/shapes for highlight backgrounds
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use CascadeItem pattern (blur entrance) for staggered list items.`,

  metrics: `Create a METRICS/KPI dashboard:
- 2-4 big numbers displayed prominently
- Each metric: large number (72-96px) counting up with interpolate + label below
- Use Circle or Pie from @remotion/shapes for circular progress indicators
- Optional trend arrow (lucide-react TrendingUp/TrendingDown)
- Numbers animate from 0 to final value over 30-40 frames
- Cards with C.card background, border-radius 12px, subtle glow
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use GlowCard for each metric. Numbers MUST use CountUp animation, never static.`,

  beforeafter: `Create a BEFORE/AFTER comparison (split screen):
- Split layout: left side (wrong way, C.red accent) | vertical divider | right side (correct way, C.accent)
- Divider: 2px vertical line at center, color C.dim
- Left content enters from left edge, right from right edge, staggered by 15 frames
- Top labels: large "❌" and "✅" or "ANTES" / "DESPUÉS" (match transcript language)
- Max content width per side: 700px
- Left side uses C.red or C.orange tones, right uses C.accent/C.green
- Each side can have a card, text block, or icon-based content
- Use Sequence blocks: Section 1 = left appears, Section 2 = divider + right appears
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Left GlowCard accent=C.red, right GlowCard accent=C.accent.`,

  funnel: `Create a FUNNEL/PIPELINE visualization (stages with flow):
- 3-5 stages arranged vertically, each as a card with icon + label + optional metric
- Stages visually decrease in width to show narrowing: first stage widest (600px), last narrowest (300px)
- Arrow/chevron connectors between stages using lucide-react ChevronDown icons
- Active/current stage: glow card (border: 1px solid C.accent + "40", boxShadow with C.accent glow)
- Future stages: outlined card (transparent bg, C.border border)
- Past stages: standard card, dimmed (opacity 0.6)
- Stage entry animation: 12-frame stagger per stage, entering from top with spring
- Use Sequence blocks to reveal stages progressively as narrator mentions them
- Ensure ALL stages fit within the safe area (1600x740px). If 5 stages, each stage max 120px tall
- Center the funnel vertically — never let top or bottom stages clip outside safe zone
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use GlowCard for active stage, outlined for future stages.`,

  gauge: `Create a GAUGE/BENCHMARK visualization (metric vs target):
- Large number centered (96-200px font, animated counting up from 0 using interpolate)
- CountUp pattern: const value = Math.round(interpolate(spring({frame,fps,config:{damping:20,mass:0.5}}),[0,1],[0,TARGET]));
- Progress bar below: height 12px, backgroundColor C.card, filled portion with accent color, borderRadius 6
- Optional benchmark dashed line at target position on the progress bar
- Label below: "Meta: X%" in C.dim text, fontSize 24
- Color logic: C.accent if value >= target, C.red if value < target * 0.7, C.orange if between
- Suffix (%, $, etc.) displayed next to the large number
- Optional: secondary metric or comparison text below the gauge
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use AnimatedMetric/OdometerDigit for the number.`,

  callout: `Create a CALLOUT/KEY PHRASE visualization:
- Large centered text (48-64px, fontWeight 700, color C.text or C.accent)
- Thin accent-colored horizontal lines above and below text (width: 80px, centered, height: 2px)
- Entry: subtle scale animation from 0.95 to 1.0 using spring
- Optional lucide-react icon above text (60-80px, C.accent color)
- Background: very subtle radial gradient glow behind text at zIndex -1
  - background: "radial-gradient(circle at 50% 50%, rgba(10,233,141,0.04), transparent 70%)"
- Text should be impactful — this is the KEY TAKEAWAY the narrator is emphasizing
- Keep it simple: one phrase, big and centered, with elegant decoration
- Fill 80%+ of the safe area (1600×740px). NEVER leave more than 20% empty. If content is small, make elements BIGGER.
- Use AnimatedText mode='word'. Background radial gradient glow. AccentSeparator above and below.`,
};

function getGenerationPrompt({ transcriptSegment, type, description, durationFrames, compositionId, brandfetchKey }) {
  const systemMsg = buildSystemPrompt(type);

  const typeGuide = TYPE_INSTRUCTIONS[type] || TYPE_INSTRUCTIONS.title;
  const compName = _componentName(compositionId);
  const componentsCode = _getComponentsForType(type);

  const logoInstructions = `
## Brand Logos
CRITICAL: When the transcript mentions a brand by name (Meta, Facebook, Google, etc.), 
you MUST use the local SVG logo: <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />.
Do NOT substitute with a lucide-react icon when a local logo exists.

For brand logos, import { staticFile } from 'remotion' and use <Img src={staticFile('logos/BRAND.svg')} style={{width:60,height:60}} />.

Available logos (in public/logos/):
- meta.svg, facebook.svg, instagram.svg, whatsapp.svg, google.svg, youtube.svg, tiktok.svg, linkedin.svg, twitter.svg, slack.svg, telegram.svg, github.svg, apple.svg, microsoft.svg, amazon.svg, netflix.svg, spotify.svg, pinterest.svg, snapchat.svg

If the brand is NOT in this list, use a lucide-react icon instead (e.g., Globe for websites, Smartphone for apps, Monitor for desktop, Cloud for cloud services, Shield for security, Mail for email).
DO NOT use cdn.brandfetch.io or any external URL for logos. NEVER reference brandfetch in any way.
DO NOT load images from external CDNs or URLs.`;



  const userMsg = `Generate a Remotion composition. You MUST start from this exact template and fill in the sections:

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
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
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

Output the COMPLETE TSX file. No explanations before or after the code.`;

  return { systemMsg, userMsg };
}

function getFeedbackPrompt({ currentTsx, feedback, compositionId, type, description }) {
  const systemMsg = buildSystemPrompt(type);

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
8. E component uses Easing.bezier(0.16, 1, 0.3, 1) with clamping — keep as defined in template
9. Keep same timing/duration unless feedback changes it
10. Frame 0 = start of clip. Sections are RELATIVE to frame 0, not absolute timeline time

Output the COMPLETE modified TSX file. No explanations.`;

  return { systemMsg, userMsg };
}

function getTypeInstructions() {
  return Object.entries(TYPE_INSTRUCTIONS).map(([key, val]) => `### ${key}\n${val}`).join('\n\n');
}

module.exports = { getGenerationPrompt, getFeedbackPrompt, getTypeInstructions };
