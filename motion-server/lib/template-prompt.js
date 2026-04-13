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

RULES:
1. All text must match the transcript language
2. Numbers must be EXACT from transcript
3. Titles: max 6 words. Descriptions: max 15 words
4. Fix obvious typos from transcript
5. Icons: use lucide-react PascalCase names (Shield, Zap, Globe, Target, TrendingUp, Users, Database, Brain, Rocket, CheckCircle, BarChart3, Lock, Eye, Server, Settings, Mail, Code, ArrowRight, ChevronRight, Heart, Star, Award, Search, Send, Cpu, Lightbulb, MousePointerClick, ShoppingCart, XCircle, Quote)
6. ACCENT_KEY options: "accent" (green/main), "orange" (warning/comparison), "purple" (secondary), "red" (danger/error)
7. Max ${maxItems} items for ${durationSecs}s duration (each item needs ~3s screen time)
8. Return ONLY valid JSON — no markdown, no explanation`;

  // Type-specific instructions for what fields to fill
  const typeFields = {
    title: '{"TITLE":"...","SUBTITLE":"...","ICON_NAME":"...","ACCENT_KEY":"accent"}',
    callout: '{"PHRASE":"...","ICON_NAME":"...","ACCENT_KEY":"accent"}',
    reveal: '{"TITLE":"...","REVEAL_ITEMS":[{"text":"..."}],"ICON_NAME":"...","ACCENT_KEY":"accent"}',
    icons: '{"TITLE":"...","ITEMS":[{"icon":"...","label":"...","accent":"accent"}]}',
    cards: '{"TITLE":"...","CARDS_DATA":[{"icon":"...","title":"...","desc":"...","accent":"accent"}]}',
    diagram: '{"TITLE":"...","NODES":[{"icon":"...","title":"...","desc":"...","accent":"accent"}]}',
    steps: '{"STEPS_DATA":[{"icon":"...","title":"...","desc":"...","accent":"accent"}]}',
    chart: '{"TITLE":"...","SUBTITLE":"...","BARS":[{"label":"...","value":0,"color":"accent"}],"VALUE_SUFFIX":"%"}',
    metrics: '{"TITLE":"...","METRICS":[{"value":0,"suffix":"%","label":"...","icon":"TrendingUp","accent":"accent"}]}',
    gauge: '{"VALUE":0,"TARGET":0,"SUFFIX":"%","LABEL":"...","SUBLABEL":"Meta: X%"}',
    list: '{"TITLE":"...","SUBTITLE":"...","LIST_ITEMS":["item 1","item 2"],"ACCENT_KEY":"accent"}',
    comparison: '{"TITLE":"...","LEFT":{"title":"...","icon":"...","accent":"red","points":["..."]},"RIGHT":{"title":"...","icon":"...","accent":"accent","points":["..."]}}',
    beforeafter: '{"TITLE":"...","BEFORE":{"label":"ANTES","items":["..."]},"AFTER":{"label":"AHORA","items":["..."]}}',
    funnel: '{"TITLE":"...","STAGES":[{"icon":"...","title":"...","pct":"100%","accent":"accent"}]}',
    timeline: '{"TITLE":"...","EVENTS":[{"icon":"...","label":"...","time":"...","accent":"accent"}]}',
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
