/**
 * Per-type creative-direction instructions for Motion-Pro generation.
 * TYPE_INSTRUCTIONS holds one detailed prompt block per motion type
 * (comparison, steps, chart, ...); getTypeInstructions() renders all of
 * them as a single markdown doc (used by the /docs endpoint).
 */

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

function getTypeInstructions() {

  return Object.entries(TYPE_INSTRUCTIONS).map(([key, val]) => `### ${key}\n${val}`).join('\n\n');

}



module.exports = { TYPE_INSTRUCTIONS, getTypeInstructions };
