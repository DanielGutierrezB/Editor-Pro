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
app.use(express.json({ limit: '10mb' }));

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
});

process.on('unhandledRejection', (reason) => {
  console.error('[motion-server] Unhandled rejection (server stays alive):', reason);
});
