const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const generateRoute = require('./routes/generate');
const renderRoute = require('./routes/render');
const feedbackRoute = require('./routes/feedback');
const studioRoute = require('./routes/studio');

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
  const { imageBase64, provider, model, apiKey } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });

  const { sendLLMWithVision } = require('./lib/llm');

  const systemMsg = `You are a professional color palette designer for motion graphics.
You receive a frame from an educational video course. Your job is to propose a color palette for motion graphics overlays that will be superimposed on this video.

RULES:
1. The bg color should be similar to the darkest area of the frame (so the motion graphics blend with the video)
2. The accent color should CONTRAST strongly with the bg — it must be vivid and easy to read
3. Card color should be slightly lighter than bg (for card backgrounds)
4. All text must be readable against both bg and card colors
5. Consider accessibility — colors must work for color-blind viewers (avoid red-green only distinctions)
6. The palette should feel professional and match the course's visual tone
7. If the frame has brand colors (logos, UI elements), incorporate them

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

  const userMsg = `Analyze this frame from an educational video course and propose a professional color palette for motion graphics overlays.
The motion graphics will be full-screen animations (titles, charts, diagrams, lists) that appear while the professor speaks.
They should complement — not clash with — the video's visual style.`;

  sendLLMWithVision({ provider, model, apiKey, systemMsg, userMsg, imageBase64 }, (err, rawResponse) => {
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
      res.json({ palette, reasoning: palette.reasoning || '' });
    } catch(e) {
      res.status(500).json({ error: 'Failed to parse palette: ' + e.message, raw: rawResponse.substring(0, 500) });
    }
  });
});

app.use('/docs', express.static(path.join(__dirname, 'public')));

app.use('/api/generate', generateRoute);
app.use('/api/render', renderRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/studio', studioRoute);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[motion-server] Error:', err.message);
  res.status(500).json({ error: err.message });
});

const server = app.listen(PORT, () => {
  console.log(`[motion-server] Running on http://localhost:${PORT}`);
  console.log(`[motion-server] Remotion project: ${RENDER_PROJECT}`);
});

process.on('SIGTERM', () => {
  console.log('[motion-server] Shutting down...');
  server.close();
});

process.on('SIGINT', () => {
  console.log('[motion-server] Shutting down...');
  server.close();
});

// Prevent server from crashing on uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[motion-server] Uncaught exception (server stays alive):', err.message);
  // Don't exit — keep serving
});

process.on('unhandledRejection', (reason) => {
  console.error('[motion-server] Unhandled rejection (server stays alive):', String(reason));
  // Don't exit — keep serving
});
