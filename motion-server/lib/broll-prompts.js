'use strict';

const fs = require('fs');
const path = require('path');

const PROMPTS_DIR = path.resolve(__dirname, '..', '..', 'Prompts', 'BRoll');

const DEFAULT_ANALYSIS_SYSTEM = `You are a professional video editor and visual storyteller specializing in educational content. Your task is to analyze a video transcript and identify moments where B-roll footage (supplementary visual content) would significantly enhance the educational impact.

## What is B-roll?
B-roll is supplementary footage that plays while the main speaker's audio continues. In educational videos, it reinforces concepts visually, maintains viewer engagement, and helps audiences understand abstract ideas through concrete visuals.

## When to recommend B-roll:
1. **Visual concepts**: When the speaker describes something that can be shown
2. **Abstract ideas**: Concepts that benefit from visual metaphors
3. **Statistics and data**: Numbers or trends that could be illustrated
4. **Technical processes**: Step-by-step operations or workflows
5. **Transitions**: Between major topic shifts
6. **Examples**: When the speaker references a real-world example
7. **Emphasis**: Key points that deserve visual reinforcement

## RULES:
- Identify 3–8 moments (be selective)
- Each moment should be 3–10 seconds long
- The description must be a specific, actionable image generation prompt
- Return ONLY valid JSON, no explanation text`;

const DEFAULT_ANALYSIS_USER = `Analyze the following transcript and identify B-roll opportunities.

{TRANSCRIPT}

Return ONLY a valid JSON array:
[
  {
    "startTime": "HH:MM:SS.mmm",
    "endTime": "HH:MM:SS.mmm",
    "description": "Specific, detailed visual prompt for image generation",
    "rationale": "Why this B-roll helps at this exact moment"
  }
]`;

const STYLE_DEFINITIONS = {
  photorealistic: `## CRITICAL: Photorealistic Style
All image descriptions MUST describe **photorealistic scenes with real people in real situations**. Think stock footage / documentary style:
- Real people in offices, meetings, looking at screens, working
- Real environments: offices, coffee shops, classrooms, streets, homes
- Real objects: laptops, phones, documents, whiteboards, money, products
- Cinematic photography: shallow depth of field, natural lighting, professional composition

**NEVER describe:**
- Animated/cartoon/illustration style images
- 3D renders or floating objects
- Abstract graphics, charts, or diagrams
- Icons, UI mockups, or infographics
- Split screens or collages`,

  comic_sketch: `## CRITICAL: Comic Sketch Style
All image descriptions MUST follow this artistic style: Rough illustrative comic sketch style, unfinished drawing aesthetic, loose and imperfect linework, slightly wobbly bold outlines, hand-drawn feel, sketchy composition, minimal refinement, low-saturation color palette with a strong green dominance, muted tones, subtle color variation, raw and expressive strokes.

**DESCRIBE:**
- Loose sketchy figures and environments rendered in a raw hand-drawn comic style
- Rough, wobbly outlines with visible pencil/ink strokes and imperfect shapes
- Low-saturation muted palette dominated by greens and earth tones
- Expressive, gestural compositions with an unfinished sketch aesthetic

**NEVER describe:**
- Photorealistic or polished illustration styles
- Clean digital art, 3D renders, or vector graphics
- High-saturation or neon color palettes
- Smooth, precise, or professionally finished linework

Maintain this artistic style consistently across all shots in a scene.`,

  blueprint: `## CRITICAL: Blueprint Style
All image descriptions MUST follow this artistic style: Black background with glowing white linework, blueprint-style aesthetic, chalkboard drawing look, technical sketch appearance, clean luminous outlines, high contrast, minimal color (monochrome white on black), soft glow effect, schematic and diagram-like style, precise yet hand-drawn feel, subtle dust or chalk texture.

**DESCRIBE:**
- Dark/black backgrounds with crisp glowing white technical linework
- Blueprint, chalkboard, or architectural schematic aesthetic
- High-contrast monochrome (white on black) with subtle chalk or dust texture
- Precise structural outlines with a soft luminous glow

**NEVER describe:**
- Colorful, photorealistic, or warm-toned images
- Organic textures, natural environments, or soft gradients
- Bright or light backgrounds
- Painterly or loose artistic styles

Maintain this artistic style consistently across all shots in a scene.`,

  courtroom_sketch: `## CRITICAL: Courtroom Sketch Style
All image descriptions MUST follow this artistic style: Courtroom sketch illustration style, traditional media look, expressive and gestural linework, loose yet controlled strokes, hand-drawn ink and colored pencil aesthetic, soft shading with layered strokes, slightly rough textures, muted and natural color palette (earth tones, subdued blues, browns, and reds), subtle paper grain, observational drawing style, dynamic but imperfect proportions, reportage illustration feel.

**DESCRIBE:**
- Expressive, gestural figures and scenes in a reportage/courtroom sketch style
- Ink and colored pencil textures with layered, soft shading strokes
- Muted earth-tone palette: browns, subdued blues, reds, natural colors
- Paper grain texture and imperfect, observational proportions with dynamic energy

**NEVER describe:**
- Photorealistic or digitally polished images
- Clean vector, cartoon, or animation styles
- Bright, saturated, or neon color palettes
- Symmetrical or overly precise compositions

Maintain this artistic style consistently across all shots in a scene.`
};

const GENERATOR_CAPABILITY_HINTS = `
## IMAGE GENERATOR CAPABILITIES (use these to write better descriptions):
- **Subject consistency**: If you describe the same person or location across different shots in a scene, they will look visually consistent. Reuse character details (age, clothing, face type) and location details (office color, furniture) across shots in the same scene.
- **Legible text**: The image generator CAN render legible text, numbers, labels, and data in images. Feel free to include specific text like "82%", "PÉRDIDA NETA", "$1.2M", dashboard labels, or chart values in your descriptions — they will appear readable.
- **World knowledge**: Be specific about what the narrator is saying at each moment. The generator understands concepts like financial dashboards, balance sheets, courtrooms, operating rooms, construction blueprints, etc. Name them explicitly.
- **Photorealism**: Descriptions of real people in real environments always produce the best results. Avoid abstract or symbolic descriptions.`;

function getAnalysisSystemPrompt(style) {
  const p = path.join(PROMPTS_DIR, 'analysis.md');
  let prompt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : DEFAULT_ANALYSIS_SYSTEM;
  const styleDef = STYLE_DEFINITIONS[style] || STYLE_DEFINITIONS.photorealistic;
  return prompt.replace('{VISUAL_STYLE}', styleDef);
}

function buildAnalysisPrompt(transcript) {
  return DEFAULT_ANALYSIS_USER.replace('{TRANSCRIPT}', transcript) + GENERATOR_CAPABILITY_HINTS;
}

module.exports = { getAnalysisSystemPrompt, buildAnalysisPrompt };
