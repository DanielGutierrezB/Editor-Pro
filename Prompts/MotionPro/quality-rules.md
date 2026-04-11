# Quality Rules for Motion Graphics

These rules improve the professional quality of generated motions.

## 1. Smooth Transitions Between Sections
- Use hard cuts between sections (default). Only use slide() if needed (5-8 frames max). NEVER use fade() or crossfade
- Hard cuts ONLY between completely different topics
- Transition duration: 10-15 frames (0.3-0.5s)

Use `<Sequence>` blocks with hard cuts. If a transition is needed, use `slide()` only (5-8 frames max).
```tsx
<Sequence from={0} durationInFrames={150} premountFor={10}><Section1 /></Sequence>
<Sequence from={150} durationInFrames={200} premountFor={10}><Section2 /></Sequence>
```

## 2. Exact Data from Transcript
- When the narrator says a specific number ("73% de los usuarios"), use EXACTLY 73 — do not invent
- When a URL is mentioned ("openclose.ai"), display it exactly as said
- When specific names/terms are used, match them character by character
- Numbers in charts MUST match the transcript, not be invented for aesthetics

## 3. Accent Color by Topic
Assign different accent colors to different topics within a single motion:
- Main topic → C.accent (#0ae98d green)
- Comparison B → C.orange
- Warning/danger → C.red
- Secondary info → C.purple
- Success/positive → C.green (same as accent)
- Data/stats → C.orange

Do NOT use the same accent color for everything. Vary by conceptual meaning.

## 4. Fill the Screen Rule
- Elements must occupy 80%+ of the safe area (1600×740 usable)
- NEVER leave more than 30% empty space
- If content is small, make elements BIGGER — not add decorative filler
- Cards: min-width 500px. Icons: min 60px. Titles: min 36px font size
- Center content vertically AND horizontally in the safe area

## 5. Text Hierarchy
Every section must have clear hierarchy:
- ONE title (largest, accent color or white, fontWeight 700)
- Supporting text (smaller, C.dim, fontWeight 400)
- Never two texts at the same size competing for attention
- Maximum 3 levels of text size per screen

## 6. Entry Timing
- First element enters at frame 0 (no delay at start)
- Subsequent elements: 10-15 frame stagger
- All elements of a section should be visible within 30 frames (1 second)
- Don't make the user wait — get content on screen fast

## 7. Reading Time Rule (CRITICAL)
Every text on screen must have enough time to be READ before disappearing.

**Minimum reading time:**
- Titles (1-4 words): 75 frames (2.5s)
- Short text (5-8 words): 120 frames (4s)
- Medium text (9-15 words): 180 frames (6s)
- Long text (16+ words): 240 frames (8s)
- Minimum for ANY text: 60 frames (2 seconds)

**NEVER remove a text before its reading time is complete.**

## 8. Cumulative Content Rule (CRITICAL)
When a section has multiple text elements or items:
- NEW elements should ADD to the screen, NOT replace previous ones
- Previous items stay visible (can dim to C.dim) while new ones appear highlighted
- All items remain visible until the section ends

**DO NOT:**
- Replace one card with another (fade out → fade in)
- Show text for < 2 seconds then remove it
- Show 5+ items simultaneously with no stagger

**DO:**
- Item 1 appears → stays visible
- Item 2 appears below/beside → Item 1 dims slightly
- Item 3 appears → Items 1,2 dim, Item 3 highlighted

## 9. Section Duration by Content
| Content | Min frames | Min seconds |
|---------|-----------|-------------|
| Title only | 75 | 2.5s |
| Title + 1 item | 120 | 4s |
| Title + 2-3 items (staggered) | 180 | 6s |
| Title + 4-5 items (staggered) | 270 | 9s |
| Chart with labels | 210 | 7s |
| Comparison (2 cards) | 240 | 8s |
| Diagram (3+ nodes) | 300 | 10s |

If the transcript section is shorter than the minimum, extend the motion to cover the needed reading time.
