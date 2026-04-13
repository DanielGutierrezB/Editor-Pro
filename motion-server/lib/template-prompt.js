function getTemplateFillingPrompt(type, transcriptSegment, description, durationFrames) {
  const durationSecs = (durationFrames / 30).toFixed(1);

  // Determine max items based on duration
  let maxItems = 3;
  if (durationFrames < 180) maxItems = 2;
  else if (durationFrames < 360) maxItems = 3;
  else if (durationFrames < 600) maxItems = 5;
  else maxItems = 8;

  const systemMsg = `You are a content extraction engine for motion graphics templates.
Your job: read the transcript and return a JSON object with content values for a "${type}" template.

REGLA CRÍTICA: NUNCA inventes texto que el narrador no dijo. Todo título, subtítulo y descripción debe ser una frase, concepto o paráfrasis corta de lo que REALMENTE dice el transcript. Si el transcript dice "segmentación correcta", usa eso — no inventes "El Futuro del Marketing Digital".

RULES:
1. All text must match the transcript language — use ONLY words/concepts from the transcript, never invent titles or descriptions
2. Numbers must be EXACT from transcript
3. Titles: max 6 words, taken directly from what the narrator says. Descriptions: max 15 words
4. Fix obvious typos from transcript
5. Icons: use lucide-react PascalCase names (Shield, Zap, Globe, Target, TrendingUp, Users, Database, Brain, Rocket, CheckCircle, BarChart3, Lock, Eye, Server, Settings, Mail, Code, ArrowRight, ChevronRight, Heart, Star, Award, Search, Send, Cpu, Lightbulb, MousePointerClick, ShoppingCart, XCircle, Quote)
6. ACCENT_KEY options: "accent" (green/main), "orange" (warning/comparison), "purple" (secondary), "red" (danger/error)
7. Max ${maxItems} items for ${durationSecs}s duration (each item needs ~3s screen time)
8. Return ONLY valid JSON — no markdown, no explanation

TIMESTAMPS PER ITEM: For each item in arrays (ITEMS, CARDS_DATA, NODES, LIST_ITEMS, STEPS_DATA, STAGES, EVENTS, BARS, METRICS, REVEAL_ITEMS, BEFORE.items, AFTER.items, LEFT.points, RIGHT.points), include a "time" field with the EXACT second from the transcript when the narrator mentions that item.

Example:
"ITEMS": [
  {"icon": "Shield", "label": "Seguridad", "accent": "accent", "time": 2.5},
  {"icon": "Zap", "label": "Velocidad", "accent": "orange", "time": 5.1},
  {"icon": "Globe", "label": "Alcance", "accent": "purple", "time": 8.3}
]

The "time" is in seconds from the START of this clip (not absolute time). If the clip starts at transcript second 20.0 and an item is mentioned at second 23.5, then time = 3.5.`;

  // Type-specific instructions for what fields to fill
  const typeFields = {
    title: '{"TITLE":"...","SUBTITLE":"...","ICON_NAME":"...","ACCENT_KEY":"accent"}',
    callout: '{"PHRASE":"...","ICON_NAME":"...","ACCENT_KEY":"accent"}',
    reveal: '{"TITLE":"...","REVEAL_ITEMS":[{"text":"...","time":0}],"ICON_NAME":"...","ACCENT_KEY":"accent"}',
    icons: '{"TITLE":"...","ITEMS":[{"icon":"...","label":"...","accent":"accent","time":0}]}',
    cards: '{"TITLE":"...","CARDS_DATA":[{"icon":"...","title":"...","desc":"...","accent":"accent","time":0}]}',
    diagram: '{"TITLE":"...","NODES":[{"icon":"...","title":"...","desc":"...","accent":"accent","time":0}]}',
    steps: '{"STEPS_DATA":[{"icon":"...","title":"...","desc":"...","accent":"accent","time":0}]}',
    chart: '{"TITLE":"...","SUBTITLE":"...","BARS":[{"label":"...","value":0,"color":"accent","time":0}],"VALUE_SUFFIX":"%"}',
    metrics: '{"TITLE":"...","METRICS":[{"value":0,"suffix":"%","label":"...","icon":"TrendingUp","accent":"accent","time":0}]}',
    list: '{"TITLE":"...","SUBTITLE":"...","LIST_ITEMS":[{"text":"item 1","time":0},{"text":"item 2","time":0}],"ACCENT_KEY":"accent"}',
    comparison: '{"TITLE":"...","LEFT":{"title":"...","icon":"...","accent":"red","points":[{"text":"...","time":0}]},"RIGHT":{"title":"...","icon":"...","accent":"accent","points":[{"text":"...","time":0}]}}',
    beforeafter: '{"TITLE":"...","BEFORE":{"label":"ANTES","items":[{"text":"...","time":0}]},"AFTER":{"label":"AHORA","items":[{"text":"...","time":0}]}}',
    funnel: '{"TITLE":"...","STAGES":[{"icon":"...","title":"...","pct":"100%","accent":"accent","time":0}]}',
    timeline: '{"TITLE":"...","EVENTS":[{"icon":"...","label":"...","time":"...","accent":"accent","showTime":0}]}',
    ui: '{"TITLE":"...","FIELDS":[{"label":"...","value":"..."}],"ACCENT_KEY":"accent"}',
  };

  const userMsg = `Template type: ${type}
Duration: ${durationSecs} seconds (${durationFrames} frames at 30fps)
Max items: ${maxItems}
Description: ${description}

Transcript:
${transcriptSegment}

Return a JSON object matching this structure:
${typeFields[type] || typeFields.title}`;

  return { systemMsg, userMsg };
}

module.exports = { getTemplateFillingPrompt };
