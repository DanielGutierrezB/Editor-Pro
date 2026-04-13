/**
 * Color Extractor — Server-side palette validation & defaults
 * 
 * Actual color extraction happens CLIENT-SIDE via canvas (see ui-motion-pro.js).
 * This module provides palette validation and default values for the server.
 */

const DEFAULT_PALETTE = {
  bg: '#1a1d23',
  card: '#2d323a',
  accent: '#0ae98d',
  green: '#0ae98d',
  orange: '#fb923c',
  purple: '#a78bfa',
  red: '#f87171',
  text: '#ffffff',
  dim: 'rgba(255,255,255,0.7)',
  border: 'rgba(255,255,255,0.08)',
  glow: 'rgba(10,233,141,0.08)',
};

/**
 * Validate and sanitize a custom palette received from the client.
 * Returns null if palette is invalid/empty, or a clean palette object.
 */
function validatePalette(palette) {
  if (!palette || typeof palette !== 'object') return null;

  // Must have at least bg and accent
  if (!palette.bg || !palette.accent) return null;

  const clean = {};
  const hexPattern = /^#[0-9a-fA-F]{6}$/;
  const rgbaPattern = /^rgba\(\d{1,3},\d{1,3},\d{1,3},[\d.]+\)$/;

  for (const [key, defaultVal] of Object.entries(DEFAULT_PALETTE)) {
    if (palette[key]) {
      // Accept hex or rgba values
      if (hexPattern.test(palette[key]) || rgbaPattern.test(palette[key])) {
        clean[key] = palette[key];
      } else {
        clean[key] = defaultVal;
      }
    } else {
      clean[key] = defaultVal;
    }
  }

  return clean;
}

module.exports = { DEFAULT_PALETTE, validatePalette };
