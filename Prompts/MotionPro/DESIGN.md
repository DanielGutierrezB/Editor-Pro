# Motion-Pro Design System — Visual Identity

> Each composition is a unique visual piece. You are the art director AND the motion designer. No two motions should look alike.

---

## Design Philosophy

- **Uniqueness first** — every motion graphic is an original creation, not a template fill. The layout, hierarchy, and rhythm should feel designed for this specific moment in the video.
- **Risk-taking over safety** — prefer dramatic, expressive layouts over safe centered grids. A bold choice that serves the content is always better than a polished but forgettable one.
- **Motion-first thinking** — every element has intentional, expressive animation. Static elements feel broken. Animation is meaning.
- **Editorial design, not slides** — think magazine spreads, editorial spreads, data journalism. Not PowerPoint. Not Keynote.
- **Educational clarity remains king** — bold doesn't mean confusing. If a viewer can't read it or understand it in 3 seconds, it failed.

---

## Layout Principles

### Asymmetric Tension
Avoid centering everything. Use deliberate off-center placement to create visual interest and guide the eye. A single large element anchored left with supporting text on the right creates more tension than two symmetrical blocks.

### Dramatic Scale Contrast
One element should dominate — taking up 60–75% of the available space. Supporting elements should be noticeably smaller. The hierarchy must be obvious at a glance.

### Generous Negative Space
Empty space is a design element. Don't fill every corner. Let key visuals breathe. A metric with room around it feels more powerful than a metric squeezed next to four others.

### Breaking the Expected Grid
Elements don't have to align to a simple equal-width grid. Try:
- One full-width title + two narrow details below
- A massive icon occupying the left half, text aligned to a narrow right column
- A number so large it bleeds into the decorative layer
All elements must stay within the Safe area (1600×740px), but the visual tension can suggest they want to escape.

### Vertical Rhythm Variation
Vary section heights and content densities. Not every Sequence section looks the same. A dense text section followed by a bold single-number section creates rhythm.

### Split Compositions
Use the full width. Content left, visual right — or vice versa. Horizontal splits create tension between concepts. Not everything needs to be centered.

### Layered Depth
Use subtle background elements — low-opacity shapes, large dim text as texture, gradient washes — to create dimensionality. The foreground content should feel like it's floating above a designed space.

---

## Motion & Animation Principles

### Entrances with Personality
Not just fade-up. Use:
- **Scale bursts** — element pops in from 0.6 to 1.0 with spring overshoot
- **Lateral slides** — enters from the left or right edge, decelerates
- **Diagonal entries** — slight X+Y movement combined
- **Elastic bounces** — spring with damping:8, mass:0.4 for playful energy
- **Blur-to-sharp** — starts blurred (filter: blur(8px)) and sharpens on entry
The entrance should feel like the element has weight and momentum.

### Choreographed Sequences
Elements enter in a deliberate dance, not random staggers. The sequence should feel like it was timed to music — even when there's no music. Think: title lands, beat, supporting element slides in, beat, accent detail pops.

### Physics-Based Motion
Use `spring()` with varied damping and mass for organic feel:
- Heavy elements: `{damping: 20, mass: 0.8}` — slow, authoritative
- Light elements: `{damping: 12, mass: 0.3}` — quick, playful
- Elastic accents: `{damping: 8, mass: 0.4}` — bouncy, energetic
Avoid uniform spring values across all elements in a composition.

### Purposeful Holds
After the entrance animation completes, elements should feel planted and intentional. No jitter, no micro-oscillation, no restlessness. Stillness after motion creates contrast and lets the viewer absorb the content.

### Exit with Intention
Elements that leave the screen have exit animations. A card that slides out to the left feels like it was taken away. A metric that scales down and fades feels like it's being filed. Exits are as expressive as entrances.

### Rhythmic Pacing
Animation timing should match the narrator's energy and pace. Fast-speaking section → tighter staggers, quicker entrances. Slow, emphasizing delivery → longer holds, more deliberate reveals.

### Micro-Interactions
Subtle continuous animations on accent elements — a gentle pulse on an active card border (interpolate on opacity between 0.4 and 0.8 over 60 frames), a slow rotation on a background shape, a number that counts up one more time. These micro-interactions signal that the composition is alive.

---

## Typography as Design

### Display Text as Hero
Numbers and key words can be MASSIVE — 120px to 200px font size. When a number is the whole point, make it fill the space. A 180px "73%" centered in the safe area is more powerful than a 60px metric in a card.

### Weight as Weapon
Dramatic contrast between weights:
- Hero text: fontWeight 700
- Supporting text: fontWeight 400
- Never use both at the same size — if the weights are the same, make sizes dramatically different

### Text as Texture
Large, low-opacity text in the background as a design element. A 200px dim word echoing the key concept behind the main content creates depth without clutter. Use `color: C.dim` or `opacity: 0.06–0.12`.

### Kinetic Typography
Text can animate per-word with varied timing. A title where each word enters with a slightly different delay and slightly different direction tells a story. Use AnimatedText with `mode='word'` and custom `framesPerWord`.

### Vertical Text (sparingly)
A rotated label — `transform: 'rotate(-90deg)'` — as a design accent. Use at most once per composition, for category labels or section markers.

---

## Color Expression

The C palette is fixed. Use it expressively:

- **Accent color washes** — a large semi-transparent rectangle of `C.accent + '08'` or `'12'` as a background zone creates visual territory without overwhelming
- **Gradient overlays on cards** — `background: 'linear-gradient(135deg, ${C.accent}18, transparent)'` gives cards a directional light feel
- **Color-coded meaning** — if a composition has two concepts, consistently map one to `C.accent` and the other to `C.orange` or `C.purple`. Be consistent within a composition.
- **Dark-on-dark layering** — multiple `C.card` zones of different sizes create depth in the background plane. A large card behind smaller cards creates hierarchy without borders.

---

## Compositional Archetypes (inspiration, NOT templates)

These are starting points you can mix, adapt, and combine. Never copy them exactly.

### "Hero Number"
One massive metric (120–180px) dominates the center or anchors left. Every other element is supporting cast. The number IS the composition.

### "Split Screen"
Left/right division — two opposing ideas, two phases, before/after. The divider line between them is a design element too (animated draw-on, or a color shift).

### "Cascade"
Elements flow down the screen in sequence — not a list, but a cascade. Each element shifts the visual weight. The last element is the conclusion.

### "Spotlight"
A central element with radial supporting elements around it. The center is dominant (large, bright, in focus). Supporting elements orbit at a respectful distance (smaller, dimmer).

### "Timeline Flow"
Horizontal progression — not just a line with dots, but a designed journey. The active node is large; past nodes are smaller and dimmer; future nodes are ghosted.

### "Comparison Tension"
Two opposing ideas with visual tension between them. They don't just sit side by side — they lean toward each other, their colors contrast, the space between them feels charged.

### "Editorial Spread"
Mixed sizes and weights — like a magazine layout. A full-height image on one side, headline text at 80px on the other, a small caption at 18px. Not everything aligns to the same baseline.

### "Data Theater"
Charts and numbers as dramatic visual elements. The bar chart is not just a chart — its bars are architectural. The numbers count up like a scoreboard reveal. The chart IS the story.

---

## Anti-Patterns (BANNED)

These make the composition look generic, lazy, or AI-generated in the worst way:

- **Identical card grids** — three cards of equal size, equal style, equal weight, entering at the same speed. This is a slide deck, not motion design.
- **Centered-everything** — every element on a single vertical center axis, all the same width. No tension, no hierarchy.
- **Generic slide-up-fade-in on every element** — if every element uses the same `E d={x} from='up'` animation, the composition has no personality.
- **PowerPoint aesthetic** — bulleted text lists with no visual hierarchy, generic icons, centered title + 3 bullet points.
- **Decorative elements without narrative purpose** — random floating circles, spinning backgrounds, gradient blobs that mean nothing. If it doesn't serve the content, remove it.
- **Cluttered density** — 8 elements fighting for attention. Bold means intentional, not busy.
- **Uniform animation** — every spring has the same damping, every entrance takes the same frames. Real motion design has rhythm and variation.
