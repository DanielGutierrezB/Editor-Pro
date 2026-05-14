const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const generateRoute = require('./routes/generate');
const proposeRoute = require('./routes/propose');
const renderRoute = require('./routes/render');
const feedbackRoute = require('./routes/feedback');
const studioRoute = require('./routes/studio');
const brollRoute = require('./routes/broll');

const PORT = process.env.MP_PORT || 3847;
const RENDER_PROJECT = path.resolve(__dirname, '..', 'motion-render');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.locals.renderProject = RENDER_PROJECT;
app.locals.outputDir = path.join(RENDER_PROJECT, 'out');

if (!fs.existsSync(app.locals.outputDir)) {
  fs.mkdirSync(app.locals.outputDir, { recursive: true });
}

// Startup cleanup: remove stale compositions from previous sessions so the
// compositions dir starts empty and session folders remain the single source of truth.
try {
  const RemotionManager = require('./lib/remotion-manager');
  const startupManager = new RemotionManager(RENDER_PROJECT);
  startupManager.cleanCompositions();
  console.log('[motion-server] Startup cleanup: compositions dir cleared');
} catch(e) {
  console.warn('[motion-server] Startup cleanup failed (non-fatal):', e.message);
}

app.get('/api/status', (_req, res) => {
  const remotionReady = fs.existsSync(path.join(RENDER_PROJECT, 'node_modules'));
  res.json({
    running: true,
    port: PORT,
    remotionReady,
    renderProject: RENDER_PROJECT,
    outputDir: app.locals.outputDir,
  });
});

// Rhythm analysis — detects pauses, emphasis, tempo changes from transcript timestamps
const { analyzeRhythm, formatRhythmForPrompt, preSegment } = require('./lib/rhythm-analyzer');

app.post('/api/rhythm', (req, res) => {
  try {
    const { transcriptJson } = req.body;
    if (!transcriptJson) return res.status(400).json({ error: 'Missing transcriptJson' });

    const rhythmData = analyzeRhythm(transcriptJson);
    const segments = preSegment(transcriptJson);
    const promptText = formatRhythmForPrompt(rhythmData, segments);

    res.json({
      markers: rhythmData.markers,
      summary: rhythmData.summary,
      sentences: rhythmData.sentences,
      preSegments: segments,
      promptText: promptText,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Prompts CRUD — reads/writes from centralized Prompts/MotionPro/ folder
const PROMPTS_CENTRAL = path.resolve(__dirname, '..', 'Prompts', 'MotionPro');
const promptsLib = path.join(__dirname, 'lib');

function _readPromptFile(centralName, localFallback) {
  const cp = path.join(PROMPTS_CENTRAL, centralName);
  if (fs.existsSync(cp)) return fs.readFileSync(cp, 'utf8');
  const lp = path.join(promptsLib, localFallback);
  if (fs.existsSync(lp)) return fs.readFileSync(lp, 'utf8');
  return '';
}

app.get('/api/prompts', (_req, res) => {
  try {
    const system = _readPromptFile('system.md', 'SYSTEM_PROMPT.md');
    const style = _readPromptFile('style-guide.md', 'STYLE_GUIDE.md');
    const design = _readPromptFile('design-fundamentals.md', 'DESIGN_FUNDAMENTALS.md');
    const { getTypeInstructions } = require('./lib/prompts');
    res.json({ system, style, design, types: getTypeInstructions() });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/prompts', (req, res) => {
  try {
    const { system, style, design } = req.body;
    if (!fs.existsSync(PROMPTS_CENTRAL)) fs.mkdirSync(PROMPTS_CENTRAL, { recursive: true });
    // Write to centralized folder
    if (system) fs.writeFileSync(path.join(PROMPTS_CENTRAL, 'system.md'), system, 'utf8');
    if (style) fs.writeFileSync(path.join(PROMPTS_CENTRAL, 'style-guide.md'), style, 'utf8');
    if (design) fs.writeFileSync(path.join(PROMPTS_CENTRAL, 'design-fundamentals.md'), design, 'utf8');
    // Also sync to local lib/ for backward compat
    if (system) fs.writeFileSync(path.join(promptsLib, 'SYSTEM_PROMPT.md'), system, 'utf8');
    if (style) fs.writeFileSync(path.join(promptsLib, 'STYLE_GUIDE.md'), style, 'utf8');
    if (design) fs.writeFileSync(path.join(promptsLib, 'DESIGN_FUNDAMENTALS.md'), design, 'utf8');
    delete require.cache[require.resolve('./lib/prompts')];
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// AI Vision Palette — sends a frame to an LLM with vision to propose a color palette
app.post('/api/palette', (req, res) => {
  const { imageBase64, images, provider, model, apiKey, category, avoidColors } = req.body;

  // If no reference images but a category was provided, return the category default palette directly
  if (!imageBase64 && (!images || !images.length)) {
    if (category && category !== 'auto') {
      const { getCategoryPalette } = require('./lib/color-extractor');
      const catPalette = getCategoryPalette(category);
      if (catPalette) return res.json({ palette: catPalette, reasoning: 'Paleta predeterminada para categoría: ' + category });
    }
    return res.status(400).json({ error: 'Missing imageBase64 or images' });
  }

  const { sendLLMWithVision } = require('./lib/llm');

  const systemMsg = `You are a professional color palette designer for motion graphics.
You receive one or more frames from an educational video course. Your job is to propose a color palette for motion graphics overlays that will be superimposed on this video.

RULES:
1. bg: Use a dark color inspired by the frame's mood (dark enough to contrast with text). NOT necessarily the darkest pixel — pick a refined dark tone that matches the video's aesthetic.
2. accent: The PRIMARY highlight color — must be VIVID and SATURATED (saturation ≥ 70%). Should complement the frame's dominant color. This is used for headings, icons, and emphasis. Must contrast strongly against bg (WCAG ratio ≥ 4.5:1).
3. card: Slightly lighter than bg (same hue family, +15-25 lightness)
4. green, orange, purple, red: FIVE DISTINCT accent colors spread across the hue wheel. Each must:
   - Be SATURATED (≥ 60% saturation) — no grays, no pastels, no muted tones
   - Have a DIFFERENT hue from the others (minimum 40° hue separation)
   - Contrast against bg (WCAG ratio ≥ 3:1 minimum)
   - The "green" should be in the green/teal range (90-170° hue)
   - The "orange" should be in the orange/yellow range (20-50° hue)
   - The "purple" should be in the purple/violet range (250-310° hue)
   - The "red" should be in the red/pink range (340-20° hue)
5. text: #ffffff for dark bg, #1a1d23 for light bg
6. If the frames have brand colors (logos, colored backgrounds, UI elements), use those as inspiration for accent colors
7. The palette should feel PROFESSIONAL and HIGH-ENERGY — think modern tech presentations, not watercolor paintings
8. CONTRAST IS KING — every accent color must pop against the background. Muted/pastel accents are NOT acceptable.

Return ONLY a JSON object with these EXACT keys:
{
  "bg": "#hex",
  "card": "#hex",
  "accent": "#hex",
  "green": "#hex",
  "orange": "#hex",
  "purple": "#hex",
  "red": "#hex",
  "text": "#hex",
  "dim": "rgba(r,g,b,0.7)",
  "border": "rgba(r,g,b,0.08)",
  "glow": "rgba(r,g,b,0.08)",
  "reasoning": "Brief explanation of choices"
}`;

  // Build user message with image labels for multiple references
  const categoryHint = (category && category !== 'auto') ? `\n\nVisual style mood requested: "${category}". Generate a palette that matches this aesthetic while still being grounded in the video's visual identity.` : '';
  const avoidHint = avoidColors ? `\n\nIMPORTANT: Generate a DIFFERENT palette than the current one (${avoidColors}). Try a contrasting or complementary approach — different hues, different mood.` : '';
  let userMsg, effectiveBase64;

  if (images && Array.isArray(images) && images.length > 1) {
    const imageLabels = images.map((img, i) => `Reference ${i + 1}: "${img.name || 'image'}"`).join('\n');
    userMsg = `Analyze these ${images.length} reference frames from an educational video course and propose a unified professional color palette for motion graphics overlays.
The motion graphics will be full-screen animations (titles, charts, diagrams, lists) that appear while the professor speaks.
They should complement — not clash with — the video's visual style.

Reference images provided:
${imageLabels}

Create a palette that works across ALL these references — find the common visual thread.${categoryHint}${avoidHint}`;
    effectiveBase64 = images[0].base64;
  } else {
    userMsg = `Analyze this frame from an educational video course and propose a professional color palette for motion graphics overlays.
The motion graphics will be full-screen animations (titles, charts, diagrams, lists) that appear while the professor speaks.
They should complement — not clash with — the video's visual style.${categoryHint}${avoidHint}`;
    effectiveBase64 = imageBase64 || (images && images[0] && images[0].base64);
  }

  sendLLMWithVision({ provider, model, apiKey, systemMsg, userMsg, imageBase64: effectiveBase64 }, (err, rawResponse) => {
    if (err) return res.status(500).json({ error: 'AI error: ' + err.message });

    try {
      let jsonStr = rawResponse.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      // Try to extract JSON from response
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      const palette = JSON.parse(jsonStr);

      // Post-LLM enforcement: boost accent colors that are too desaturated
      const _accentKeys = ['accent', 'green', 'orange', 'purple', 'red'];
      const _parseHex = (hex) => {
        if (!hex || typeof hex !== 'string') return null;
        const h = hex.replace('#', '');
        if (h.length !== 6) return null;
        return { r: parseInt(h.substr(0,2),16), g: parseInt(h.substr(2,2),16), b: parseInt(h.substr(4,2),16) };
      };
      const _rgbToHsl = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h, s, l = (max+min)/2;
        if (max === min) { h = s = 0; } else {
          const d = max - min;
          s = l > 0.5 ? d/(2-max-min) : d/(max+min);
          if (max===r) h = ((g-b)/d + (g<b?6:0))/6;
          else if (max===g) h = ((b-r)/d+2)/6;
          else h = ((r-g)/d+4)/6;
        }
        return { h: h*360, s, l };
      };
      const _hslToHex = (h, s, l) => {
        const c = (1-Math.abs(2*l-1))*s;
        const x = c*(1-Math.abs(((h/60)%2)-1));
        const m = l-c/2;
        let r1=0,g1=0,b1=0;
        if(h<60){r1=c;g1=x;}else if(h<120){r1=x;g1=c;}else if(h<180){g1=c;b1=x;}
        else if(h<240){g1=x;b1=c;}else if(h<300){r1=x;b1=c;}else{r1=c;b1=x;}
        const r=Math.round((r1+m)*255),g=Math.round((g1+m)*255),b=Math.round((b1+m)*255);
        return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
      };

      let boosted = [];
      for (const key of _accentKeys) {
        if (!palette[key]) continue;
        const c = _parseHex(palette[key]);
        if (!c) continue;
        const hsl = _rgbToHsl(c.r, c.g, c.b);
        // Enforce minimum saturation of 55% and lightness between 40-70%
        if (hsl.s < 0.55 || hsl.l < 0.35 || hsl.l > 0.75) {
          const newS = Math.max(hsl.s, 0.65);
          const newL = Math.max(0.45, Math.min(0.65, hsl.l));
          palette[key] = _hslToHex(hsl.h, newS, newL);
          boosted.push(key);
        }
      }
      if (boosted.length > 0) {
        console.log('[palette] Boosted saturation for: ' + boosted.join(', '));
      }

      res.json({ palette, reasoning: palette.reasoning || '' });
    } catch(e) {
      res.status(500).json({ error: 'Failed to parse palette: ' + e.message, raw: rawResponse.substring(0, 500) });
    }
  });
});

app.use('/docs', express.static(path.join(__dirname, 'public')));

app.use('/api/generate/propose', proposeRoute);
app.use('/api/generate', generateRoute);
app.use('/api/render', renderRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/studio', studioRoute);
app.use('/api/broll', brollRoute);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[motion-server] Error:', err.message);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[motion-server] Running on http://127.0.0.1:${PORT}`);
  console.log(`[motion-server] Remotion project: ${RENDER_PROJECT}`);
});

process.on('SIGTERM', () => {
  console.log('[motion-server] Shutting down (SIGTERM)...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[motion-server] Shutting down (SIGINT)...');
  server.close(() => process.exit(0));
});

// Prevent server from crashing on uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[motion-server] Uncaught exception:', err.stack || err.message);
  // EADDRINUSE is fatal — server can't function without the port
  if (err.code === 'EADDRINUSE') {
    console.error('[motion-server] Port in use — exiting with code 1');
    process.exit(1);
  }
  // Other exceptions — keep serving
});

process.on('unhandledRejection', (reason) => {
  console.error('[motion-server] Unhandled rejection (server stays alive):', reason && reason.stack ? reason.stack : String(reason));
  // Don't exit — keep serving
});
