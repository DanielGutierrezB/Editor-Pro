/**
 * broll-styles.js — Visual style definitions and prompt building for B-Roll.
 * Single source of truth for style definitions (replaces duplicates in broll.js and broll-prompts.js).
 * Extends window.BRoll prototype.
 */
(function(global) {
    "use strict";

    // ── System prompt (overridden from file on first use) ────────────────────

    var BROLL_SYSTEM_PROMPT = [
        "You are a professional video editor and visual storyteller specializing in educational content.",
        "Analyze the transcript and identify 3-8 moments where B-roll visual content would enhance the educational impact.",
        "",
        "Each moment should be 3-10 seconds long. The description must be a specific, actionable image generation prompt.",
        "Good: 'Close-up of hands typing Python code on a dark terminal'",
        "Bad: 'Something visual', 'A relevant image'",
        "",
        "Return ONLY a valid JSON array:",
        '[{ "startTime": "HH:MM:SS.mmm", "endTime": "HH:MM:SS.mmm", "description": "...", "rationale": "..." }]'
    ].join("\n");

    // ── Style definitions (canonical — server reads from broll-prompts.js, client from here) ──

    var STYLE_DEFS = {
        photorealistic: [
            "## CRITICAL: Photorealistic Style",
            "All image descriptions MUST describe **photorealistic scenes with real people in real situations**. Think stock footage / documentary style:",
            "- Real people in offices, meetings, looking at screens, working",
            "- Real environments: offices, coffee shops, classrooms, streets, homes",
            "- Real objects: laptops, phones, documents, whiteboards, money, products",
            "- Cinematic photography: shallow depth of field, natural lighting, professional composition",
            "",
            "**NEVER describe:**",
            "- Animated/cartoon/illustration style images",
            "- 3D renders or floating objects",
            "- Abstract graphics, charts, or diagrams",
            "- Icons, UI mockups, or infographics",
            "- Split screens or collages"
        ].join("\n"),

        comic_sketch: [
            "## CRITICAL: Comic Sketch Style",
            "All image descriptions MUST follow this artistic style: Rough illustrative comic sketch style, unfinished drawing aesthetic, loose and imperfect linework, slightly wobbly bold outlines, hand-drawn feel, sketchy composition, minimal refinement, low-saturation color palette with a strong green dominance, muted tones, subtle color variation, raw and expressive strokes.",
            "",
            "**DESCRIBE:**",
            "- Loose sketchy figures and environments rendered in a raw hand-drawn comic style",
            "- Rough, wobbly outlines with visible pencil/ink strokes and imperfect shapes",
            "- Low-saturation muted palette dominated by greens and earth tones",
            "- Expressive, gestural compositions with an unfinished sketch aesthetic",
            "",
            "**NEVER describe:**",
            "- Photorealistic or polished illustration styles",
            "- Clean digital art, 3D renders, or vector graphics",
            "- High-saturation or neon color palettes",
            "- Smooth, precise, or professionally finished linework",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n"),

        blueprint: [
            "## CRITICAL: Blueprint Style",
            "All image descriptions MUST follow this artistic style: Black background with glowing white linework, blueprint-style aesthetic, chalkboard drawing look, technical sketch appearance, clean luminous outlines, high contrast, minimal color (monochrome white on black), soft glow effect, schematic and diagram-like style, precise yet hand-drawn feel, subtle dust or chalk texture.",
            "",
            "**DESCRIBE:**",
            "- Dark/black backgrounds with crisp glowing white technical linework",
            "- Blueprint, chalkboard, or architectural schematic aesthetic",
            "- High-contrast monochrome (white on black) with subtle chalk or dust texture",
            "- Precise structural outlines with a soft luminous glow",
            "",
            "**NEVER describe:**",
            "- Colorful, photorealistic, or warm-toned images",
            "- Organic textures, natural environments, or soft gradients",
            "- Bright or light backgrounds",
            "- Painterly or loose artistic styles",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n"),

        courtroom_sketch: [
            "## CRITICAL: Courtroom Sketch Style",
            "All image descriptions MUST follow this artistic style: Courtroom sketch illustration style, traditional media look, expressive and gestural linework, loose yet controlled strokes, hand-drawn ink and colored pencil aesthetic, soft shading with layered strokes, slightly rough textures, muted and natural color palette (earth tones, subdued blues, browns, and reds), subtle paper grain, observational drawing style, dynamic but imperfect proportions, reportage illustration feel.",
            "",
            "**DESCRIBE:**",
            "- Expressive, gestural figures and scenes in a reportage/courtroom sketch style",
            "- Ink and colored pencil textures with layered, soft shading strokes",
            "- Muted earth-tone palette: browns, subdued blues, reds, natural colors",
            "- Paper grain texture and imperfect, observational proportions with dynamic energy",
            "",
            "**NEVER describe:**",
            "- Photorealistic or digitally polished images",
            "- Clean vector, cartoon, or animation styles",
            "- Bright, saturated, or neon color palettes",
            "- Symmetrical or overly precise compositions",
            "",
            "Maintain this artistic style consistently across all shots in a scene."
        ].join("\n")
    };

    // ── Style prefix for image generation prompts ────────────────────────────

    var STYLE_PREFIX = {
        photorealistic: "Photorealistic style, cinematic photography, real people in real environments. ",
        comic_sketch: "Rough illustrative comic sketch style, unfinished drawing aesthetic, loose linework, wobbly outlines, hand-drawn feel, low-saturation muted palette. ",
        blueprint: "Black background with glowing white linework, blueprint-style, chalkboard look, clean luminous outlines, high contrast monochrome, schematic diagram style. ",
        courtroom_sketch: "Courtroom sketch illustration style, expressive gestural linework, hand-drawn ink and colored pencil, soft shading, muted earth tones, paper grain texture, reportage feel. "
    };

    // ── Style keyword patterns for stripping when style changes ─────────────

    var STYLE_KEYWORDS = {
        photorealistic: /\b(photorealistic|stock footage|documentary style|shallow depth of field|cinematic photography|natural lighting|real people|real environment)\b/gi,
        comic_sketch: /\b(comic sketch|unfinished drawing|loose linework|wobbly outlines|hand-drawn feel|sketchy composition|low-saturation|muted tones|raw.{0,5}expressive strokes|rough illustrative)\b/gi,
        blueprint: /\b(blueprint[- ]?style|chalkboard|chalk effect|chalk texture|glowing white (lines|linework|outlines)|black background|luminous outlines|high contrast monochrome|schematic|diagram-like|technical sketch|white on black|soft glow effect)\b/gi,
        courtroom_sketch: /\b(courtroom sketch|reportage|gestural linework|ink and colored pencil|paper grain|earth tones?|muted natural|observational drawing)\b/gi
    };

    /**
     * Strip style-specific keywords from a description.
     * Used when the user changes the visual style AFTER analysis — the LLM-generated
     * descriptions already contain style instructions from the original style that
     * would conflict with the new style prefix.
     */
    function stripStyleKeywords(description, styleToStrip) {
        var pattern = STYLE_KEYWORDS[styleToStrip];
        if (!pattern) return description;
        // Reset regex state (global flag)
        pattern.lastIndex = 0;
        var cleaned = description.replace(pattern, "");
        // Clean up leftover punctuation artifacts (double commas, leading commas, etc.)
        cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\.\s*\./g, ".").replace(/,\s*\./g, ".");
        cleaned = cleaned.replace(/^\s*[,.:;]\s*/, "").replace(/\s{2,}/g, " ").trim();
        return cleaned;
    }

    // ── Prompt building ──────────────────────────────────────────────────────

    function buildStyledPrompt(promptTemplate, style) {
        var styleDef = STYLE_DEFS[style] || STYLE_DEFS.photorealistic;
        return promptTemplate.replace("{VISUAL_STYLE}", styleDef);
    }

    var _brollPromptLoaded = false;
    function ensureBrollPrompt() {
        if (_brollPromptLoaded) return;
        _brollPromptLoaded = true;
        try {
            var csInterface = window._epCSInterface;
            if (!csInterface) return;
            var extPath = csInterface.getSystemPath("extension");
            var promptPath = require("path").join(extPath, "Prompts", "BRoll", "analysis.md");
            if (require("fs").existsSync(promptPath)) {
                BROLL_SYSTEM_PROMPT = require("fs").readFileSync(promptPath, "utf8");
            }
        } catch(e) {}
    }

    // ── Public API ───────────────────────────────────────────────────────────

    global._epBrollStyles = {
        STYLE_DEFS: STYLE_DEFS,
        STYLE_PREFIX: STYLE_PREFIX,
        getSystemPrompt: function() { return BROLL_SYSTEM_PROMPT; },
        buildStyledPrompt: buildStyledPrompt,
        ensureBrollPrompt: ensureBrollPrompt,
        getStylePrefix: function(style) { return STYLE_PREFIX[style] || ""; },
        stripStyleKeywords: stripStyleKeywords
    };

})(window);
