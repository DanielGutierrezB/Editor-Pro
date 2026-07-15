/**
 * Color-palette helpers for Motion-Pro prompt building.
 * Builds the `const C = {...}` TSX code block for a composition (default/custom
 * palette, light/chroma/alpha background modes) and a short prompt-context note
 * describing the active palette.
 */
const { DEFAULT_PALETTE, validatePalette, getCategoryDescription } = require('../color-extractor');

// ──────────────────────────────────────────────────────────────────────────────
// Palette helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the `const C = {...}` TSX code block using a custom palette or defaults.
 * Returns the exact code string for the template.
 */
function _parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return { r: parseInt(h.substr(0,2),16), g: parseInt(h.substr(2,2),16), b: parseInt(h.substr(4,2),16) };
}

function _isGreenish(hex) {
  const c = _parseHex(hex);
  if (!c) return false;
  return c.g > 150 && c.g > c.r * 1.3 && c.g > c.b * 1.3;
}

function _isBluish(hex) {
  const c = _parseHex(hex);
  if (!c) return false;
  return c.b > 120 && c.b > c.r * 1.2 && c.b > c.g * 1.2;
}

function _chromaSafe(hex, chromaIsBlue) {
  if (chromaIsBlue && _isBluish(hex)) return '#fb923c';
  if (!chromaIsBlue && _isGreenish(hex)) return '#a78bfa';
  return hex;
}

/**
 * Calculate relative luminance of a color (WCAG formula).
 */
function _luminance(hex) {
  const c = _parseHex(hex);
  if (!c) return 1;
  const [rs, gs, bs] = [c.r / 255, c.g / 255, c.b / 255].map(function(v) {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Contrast ratio between two colors (1:1 to 21:1).
 */
function _contrastRatio(hex1, hex2) {
  const l1 = _luminance(hex1);
  const l2 = _luminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Darken a hex color by a factor (0-1). 0 = no change, 1 = black.
 */
function _darken(hex, amount) {
  const c = _parseHex(hex);
  if (!c) return hex;
  const r = Math.round(c.r * (1 - amount));
  const g = Math.round(c.g * (1 - amount));
  const b = Math.round(c.b * (1 - amount));
  return '#' + [r, g, b].map(function(v) { return v.toString(16).padStart(2, '0'); }).join('');
}

/**
 * Ensure a color has sufficient contrast against a background.
 * Progressively darkens the color until contrast ratio >= minRatio.
 */
function _ensureContrast(fgHex, bgHex, minRatio) {
  minRatio = minRatio || 4.5;
  let fg = fgHex;
  for (let step = 0; step < 10; step++) {
    if (_contrastRatio(fg, bgHex) >= minRatio) return fg;
    fg = _darken(fg, 0.15);
  }
  return fg;
}

/**
 * Build light-mode palette: adapts accent colors for contrast against white.
 * Also computes a subtle card tint from the dominant accent.
 */
function _buildLightPalette(p) {
  const lightBg = '#f8f9fa';
  // Ensure each accent color contrasts against the light background
  const accent = _ensureContrast(p.accent, lightBg, 4.5);
  const green  = _ensureContrast(p.green, lightBg, 4.5);
  const orange = _ensureContrast(p.orange, lightBg, 4.5);
  const purple = _ensureContrast(p.purple, lightBg, 4.5);
  const red    = _ensureContrast(p.red, lightBg, 4.5);

  // Card tint: very subtle version of the accent (5% opacity effect)
  const ac = _parseHex(p.accent);
  const cardTint = ac
    ? 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.06)'
    : 'rgba(0,0,0,0.03)';

  // Glow based on accent
  const glowColor = ac
    ? 'rgba(' + ac.r + ',' + ac.g + ',' + ac.b + ',0.08)'
    : 'rgba(0,0,0,0.04)';

  return {
    bg: lightBg,
    card: cardTint,
    accent: accent,
    green: green,
    orange: orange,
    purple: purple,
    red: red,
    text: '#1a1d23',
    dim: 'rgba(0,0,0,0.55)',
    border: 'rgba(0,0,0,0.10)',
    glow: glowColor,
  };
}

function _buildPaletteCode(customPalette, bgMode) {
  const p = customPalette ? (validatePalette(customPalette) || DEFAULT_PALETTE) : DEFAULT_PALETTE;
  let bg = p.bg, card = p.card, text = p.text, dim = p.dim, border = p.border, glow = p.glow;

  if (bgMode === 'light') {
    const lp = _buildLightPalette(p);
    return `const C = {\n`
      + `  bg:'${lp.bg}', card:'${lp.card}', accent:'${lp.accent}', green:'${lp.green}',\n`
      + `  orange:'${lp.orange}', purple:'${lp.purple}', red:'${lp.red}', text:'${lp.text}',\n`
      + `  dim:'${lp.dim}', border:'${lp.border}',\n`
      + `  glow:'${lp.glow}',\n`
      + `};`;
  } else if (bgMode === 'chroma') {
    const hasGreen = _isGreenish(p.accent) || _isGreenish(p.green);
    const chromaIsBlue = hasGreen;
    bg = chromaIsBlue ? '#0000FF' : '#00FF00';
    card = 'rgba(0,0,0,0.65)';
    return `const C = {\n`
      + `  bg:'${bg}', card:'${card}', accent:'${_chromaSafe(p.accent, chromaIsBlue)}', green:'${_chromaSafe(p.green, chromaIsBlue)}',\n`
      + `  orange:'${_chromaSafe(p.orange, chromaIsBlue)}', purple:'${_chromaSafe(p.purple, chromaIsBlue)}', red:'${_chromaSafe(p.red, chromaIsBlue)}', text:'${text}',\n`
      + `  dim:'${dim}', border:'${border}',\n`
      + `  glow:'${glow}',\n`
      + `};`;
  } else if (bgMode === 'alpha') {
    bg = 'transparent';
    card = 'rgba(0,0,0,0.65)';
  }

  return `const C = {\n`
    + `  bg:'${bg}', card:'${card}', accent:'${p.accent}', green:'${p.green}',\n`
    + `  orange:'${p.orange}', purple:'${p.purple}', red:'${p.red}', text:'${text}',\n`
    + `  dim:'${dim}', border:'${border}',\n`
    + `  glow:'${glow}',\n`
    + `};`;
}

/**
 * Build a short description of the active palette for prompt context.
 */
function _paletteContextNote(customPalette, paletteCategory, bgMode) {
  const parts = [];
  if (paletteCategory && paletteCategory !== 'auto') {
    const desc = getCategoryDescription(paletteCategory);
    if (desc) parts.push(`Visual style category: ${desc}`);
  }
  if (customPalette) {
    const p = validatePalette(customPalette);
    if (p) {
      parts.push(`Custom palette active — bg: ${p.bg}, accent: ${p.accent}, card: ${p.card}, text: ${p.text}. These colors are from the course's visual identity — use them consistently.`);
    }
  }
  if (bgMode === 'light') {
    parts.push(`LIGHT MODE ACTIVE — Important design rules:
- Background is LIGHT (#f8f9fa). Card backgrounds use a subtle tint of the accent color.
- ALL text must be dark (C.text = '#1a1d23') or use the accent colors from C — NEVER use white or light-colored text.
- For card/box backgrounds, use C.card (which has a subtle accent tint) or use accent colors with low opacity (e.g. C.accent + '15' for 8% opacity hex).
- Ensure high contrast: dark text on light backgrounds, accent-colored elements should be saturated enough to read.
- Icons and decorative elements should use C.accent, C.green, C.orange etc. — these have been adjusted for light-background contrast.
- Do NOT use white (#fff, #ffffff) for any text, title, or label — it will be invisible.`);
  }
  return parts.length > 0 ? '\n\n## ACTIVE COLOR PALETTE\n' + parts.join('\n') : '';
}

module.exports = { buildPaletteCode: _buildPaletteCode, paletteContextNote: _paletteContextNote, isGreenish: _isGreenish };
