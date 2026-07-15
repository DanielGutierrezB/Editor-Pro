/**
 * System prompt loader for Motion-Pro LLM generation.
 * Loads the base doc (SYSTEM_PROMPT.md/system.md), the available-packages,
 * design-system, and quality-rules docs from Prompts/MotionPro/, concatenates
 * them, and strips the Advanced Animation Techniques section for types that
 * don't need it.
 */
const fs = require('fs');
const path = require('path');

const LIB_DIR = path.resolve(__dirname, '..');
const PROMPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'Prompts', 'MotionPro');

function _loadDoc(centralName, localFallback) {
  const centralPath = path.join(PROMPTS_DIR, centralName);
  if (fs.existsSync(centralPath)) {
    return fs.readFileSync(centralPath, 'utf8');
  }
  if (localFallback) {
    const localPath = path.join(LIB_DIR, localFallback);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath, 'utf8');
    }
  }
  console.warn(`[prompts] Missing: ${centralName}`);
  return '';
}

const SYSTEM_PROMPT_DOC = _loadDoc('system.md', 'SYSTEM_PROMPT.md');
const AVAILABLE_PACKAGES = _loadDoc('available-packages.md', '');
const DESIGN_SYSTEM = _loadDoc('DESIGN.md', '');
const QUALITY_RULES = _loadDoc('quality-rules.md', '');

const FULL_SYSTEM_PROMPT = [
  SYSTEM_PROMPT_DOC,
  AVAILABLE_PACKAGES ? '\n\n---\n\n# AVAILABLE PACKAGES (USE THESE)\n\n' + AVAILABLE_PACKAGES : '',
  DESIGN_SYSTEM ? '\n\n---\n\n# DESIGN SYSTEM (YOUR VISUAL IDENTITY)\n\n' + DESIGN_SYSTEM : '',
  QUALITY_RULES ? '\n\n---\n\n# QUALITY RULES (MUST FOLLOW)\n\n' + QUALITY_RULES : '',
].join('');

// ──────────────────────────────────────────────────────────────────────────────
// Dynamic system prompt — strip Section 1.13 for types that don't need it
// ──────────────────────────────────────────────────────────────────────────────

const ADVANCED_TECHNIQUE_TYPES = new Set(['metrics', 'gauge', 'reveal', 'icons', 'list']);

function buildSystemPrompt(type) {
  if (ADVANCED_TECHNIQUE_TYPES.has(type)) {
    return FULL_SYSTEM_PROMPT; // needs CascadeItem, OdometerDigit, MorphPosition docs
  }
  // Strip Section 1.13 (Advanced Animation Techniques) — ~150 lines of examples
  return FULL_SYSTEM_PROMPT.replace(
    /### 1\.13 Advanced Animation Techniques[\s\S]*?(?=\n---\n\n## SECTION 2)/,
    ''
  );
}

module.exports = { buildSystemPrompt };
