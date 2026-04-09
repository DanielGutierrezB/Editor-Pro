const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { sendLLM } = require('../lib/llm');
const RemotionManager = require('../lib/remotion-manager');
const { getFeedbackPrompt } = require('../lib/prompts');

function _logFeedback(opts) {
  try {
    const logDir = opts.outputDir || path.resolve(__dirname, '..', '..', 'motion-render', 'out');
    const logPath = path.join(logDir, 'FEEDBACK.md');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    // Initialize file with header if new
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, [
        '# Motion-Pro — Feedback Log',
        '',
        'Este archivo registra cada feedback enviado a los motions generados.',
        'Usa este archivo para compartir con tu agente de IA y mejorar los prompts de generación.',
        '',
        '---',
        '',
      ].join('\n'), 'utf8');
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Check for reference images in feedback dir
    const feedbackImgDir = path.join(logDir, 'feedback');
    let refImages = [];
    if (fs.existsSync(feedbackImgDir)) {
      const baseId = opts.compositionId.replace(/-v\d+$/, '');
      refImages = fs.readdirSync(feedbackImgDir)
        .filter(f => f.indexOf(baseId) === 0 && f.endsWith('.png'))
        .sort()
        .slice(-5); // last 5 images for this motion
    }

    const entry = [
      `## ${opts.compositionId} → ${opts.newCompositionId}`,
      `**Fecha:** ${timestamp}`,
      `**Tipo de animación:** ${opts.type || 'desconocido'}`,
      `**Descripción:** ${opts.description || 'sin descripción'}`,
      '',
      '### Feedback del usuario',
      opts.feedback,
      '',
      '### Contexto',
      `- **Archivo origen:** \`${opts.compositionId}.tsx\``,
      `- **Archivo nuevo:** \`${opts.newCompositionId}.tsx\``,
      `- **Duración:** ${opts.durationFrames || '?'} frames (${opts.durationFrames ? (opts.durationFrames / 30).toFixed(1) + 's' : '?'})`,
      `- **Modelo IA:** ${opts.model || 'desconocido'}`,
      `- **Proveedor:** ${opts.provider || 'desconocido'}`,
    ];

    if (refImages.length > 0) {
      entry.push('');
      entry.push('### Imágenes de referencia');
      refImages.forEach(img => {
        entry.push(`- \`feedback/${img}\``);
      });
    }

    entry.push('');
    entry.push('### Problema identificado');
    entry.push(_analyzeFeedbackPattern(opts.feedback));
    entry.push('');
    entry.push('---');
    entry.push('');

    fs.appendFileSync(logPath, entry.join('\n'), 'utf8');
  } catch(_e) {
    console.warn('[feedback] Log error:', _e.message);
  }
}

function _analyzeFeedbackPattern(feedback) {
  const fb = feedback.toLowerCase();
  const patterns = [];

  if (fb.match(/centr|aligne|alinea/)) patterns.push('**Alineación/Centrado** — Elementos no están alineados o centrados correctamente.');
  if (fb.match(/espacio|separad|distribu|aprovech/)) patterns.push('**Distribución de espacio** — Elementos muy juntos, muy separados, o no aprovechan el espacio disponible.');
  if (fb.match(/color|colore/)) patterns.push('**Colores** — Cambio de colores o paleta solicitado.');
  if (fb.match(/fuente|font|texto|tipograf/)) patterns.push('**Tipografía** — Cambio de fuente, tamaño o peso.');
  if (fb.match(/animaci|movimient|transici|fade|entrada|salida/)) patterns.push('**Animación/Transición** — Cambio en cómo entran/salen/transicionan los elementos.');
  if (fb.match(/tamaño|grande|pequeñ|escala/)) patterns.push('**Escala/Tamaño** — Elementos demasiado grandes o pequeños.');
  if (fb.match(/borde|marco|sombra|glow/)) patterns.push('**Estilo visual** — Bordes, sombras, marcos, efectos.');
  if (fb.match(/contenido|texto|dato|inform/)) patterns.push('**Contenido** — Cambio en el texto o datos mostrados.');
  if (fb.match(/layout|diseño|posici|arriba|abajo|izquierda|derecha/)) patterns.push('**Layout/Posición** — Reorganización de elementos en pantalla.');
  if (fb.match(/lent|rápid|veloc|timing|tiempo/)) patterns.push('**Timing** — Velocidad de animación o duración de secciones.');
  if (fb.match(/bounce|rebote|suave|fluid/)) patterns.push('**Spring config** — Tipo de easing (bounce vs suave).');

  if (patterns.length === 0) patterns.push('Feedback general — revisar manualmente.');
  return patterns.join('\n');
}

router.post('/', (req, res) => {
  const {
    compositionId,
    feedback,
    provider,
    model,
    apiKey,
    newVersion,
    outputDir,
    sessionDir,
    type,
    description,
  } = req.body;

  if (!compositionId || !feedback) {
    return res.status(400).json({ error: 'Missing compositionId or feedback' });
  }

  const manager = new RemotionManager(req.app.locals.renderProject);

  // Sync session to ensure we have the right compositions
  if (sessionDir) manager.syncFromSession(sessionDir);

  const currentTsx = manager.getCompositionTsx(compositionId);

  if (!currentTsx) {
    return res.status(404).json({ error: `Composition ${compositionId} not found` });
  }

  const baseId = compositionId.replace(/[-_]v\d+$/, '');
  const newCompositionId = (baseId + '-v' + (newVersion || 2)).replace(/_/g, '-');

  // Get duration from Root.tsx registration, not from TSX content
  // (TSX has durationInFrames on Sequence blocks which are shorter than total)
  var durationFrames = 300;
  try {
    var rootContent = require('fs').readFileSync(manager.rootTsxPath, 'utf8');
    var regStr = 'id="' + compositionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*durationInFrames=\\{(\\d+)\\}';
    var rootMatch = rootContent.match(new RegExp(regStr));
    if (rootMatch) durationFrames = parseInt(rootMatch[1]);
  } catch(_e) {}

  const { systemMsg, userMsg } = getFeedbackPrompt({
    currentTsx,
    feedback,
    compositionId: newCompositionId,
    type: type || 'title',
    description: description || '',
  });

  sendLLM({ provider, model, apiKey, systemMsg, userMsg }, (err, rawCode) => {
    if (err) {
      return res.status(500).json({ error: 'LLM error: ' + err.message });
    }

    let tsxCode = rawCode;
    const codeMatch = rawCode.match(/```(?:tsx?|jsx?|react)?\s*\n([\s\S]*?)```/);
    if (codeMatch) {
      tsxCode = codeMatch[1].trim();
    }

    try {
      const tsxPath = manager.writeComposition(newCompositionId, tsxCode, durationFrames);
      if (sessionDir) manager.saveToSession(newCompositionId, sessionDir);
      _logFeedback({
        outputDir,
        compositionId,
        feedback,
        newCompositionId,
        type: type || 'unknown',
        description: description || '',
        durationFrames,
        model: model || '',
        provider: provider || '',
      });
      res.json({
        compositionId: newCompositionId,
        tsxPath,
        durationFrames,
        status: 'generated',
      });
    } catch (writeErr) {
      res.status(500).json({ error: 'Write error: ' + writeErr.message });
    }
  });
});

module.exports = router;
