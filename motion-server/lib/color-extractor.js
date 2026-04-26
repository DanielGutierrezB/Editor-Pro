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

const CATEGORY_PALETTES = {
  'alto-contraste': { bg: '#0d0d0d', card: '#1a1a1a', accent: '#ff3b30', green: '#30d158', orange: '#ff9f0a', purple: '#bf5af2', red: '#ff3b30', text: '#ffffff', dim: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.12)', glow: 'rgba(255,59,48,0.1)' },
  'bajo-contraste': { bg: '#1e1e2e', card: '#2a2a3e', accent: '#89b4fa', green: '#a6e3a1', orange: '#fab387', purple: '#cba6f7', red: '#f38ba8', text: '#cdd6f4', dim: 'rgba(205,214,244,0.6)', border: 'rgba(205,214,244,0.08)', glow: 'rgba(137,180,250,0.06)' },
  'monocromatico': { bg: '#0f1923', card: '#1a2a38', accent: '#4db8ff', green: '#4db8ff', orange: '#7accff', purple: '#a0d9ff', red: '#2d9cdb', text: '#e8f4fd', dim: 'rgba(232,244,253,0.6)', border: 'rgba(77,184,255,0.1)', glow: 'rgba(77,184,255,0.08)' },
  'corporativo': { bg: '#0d1b2e', card: '#162639', accent: '#2d7dd2', green: '#2d7dd2', orange: '#f4a261', purple: '#5b6abf', red: '#e63946', text: '#ffffff', dim: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.08)', glow: 'rgba(45,125,210,0.08)' },
  'neon': { bg: '#000000', card: '#0d0d0d', accent: '#00ffff', green: '#39ff14', orange: '#ff6700', purple: '#ff00ff', red: '#ff0040', text: '#ffffff', dim: 'rgba(255,255,255,0.7)', border: 'rgba(0,255,255,0.15)', glow: 'rgba(0,255,255,0.1)' },
  'calido': { bg: '#1a0f0a', card: '#2d1a12', accent: '#f4a261', green: '#e9c46a', orange: '#e76f51', purple: '#c77dff', red: '#e63946', text: '#fdf4e7', dim: 'rgba(253,244,231,0.6)', border: 'rgba(244,162,97,0.1)', glow: 'rgba(244,162,97,0.08)' },
  'frio': { bg: '#0a1628', card: '#0f2040', accent: '#00b4d8', green: '#90e0ef', orange: '#48cae4', purple: '#7b2d8b', red: '#e63946', text: '#caf0f8', dim: 'rgba(202,240,248,0.6)', border: 'rgba(0,180,216,0.1)', glow: 'rgba(0,180,216,0.08)' },
  'editorial': { bg: '#f5f0e8', card: '#ede8e0', accent: '#c0392b', green: '#27ae60', orange: '#e67e22', purple: '#8e44ad', red: '#c0392b', text: '#1a1a1a', dim: 'rgba(26,26,26,0.6)', border: 'rgba(26,26,26,0.08)', glow: 'rgba(192,57,43,0.06)' },
  'gradiente': { bg: '#1a1d23', card: '#2d323a', accent: '#7c3aed', green: '#0ae98d', orange: '#fb923c', purple: '#a78bfa', red: '#f87171', text: '#ffffff', dim: 'rgba(255,255,255,0.55)', border: 'rgba(255,255,255,0.08)', glow: 'rgba(124,58,237,0.1)' },
};

const CATEGORY_DESCRIPTIONS = {
  'alto-contraste': 'Alto contraste — fondo ultra oscuro, colores de acento vibrantes y saturados, máxima legibilidad',
  'bajo-contraste': 'Bajo contraste — tonos suaves y pastel, acento desaturado, sensación elegante y refinada',
  'monocromatico': 'Monocromático — un solo matiz con variaciones de luminosidad y saturación',
  'corporativo': 'Corporativo — fondo azul oscuro/navy, texto blanco, acento azul profesional, conservador',
  'neon': 'Neón — fondo negro puro, colores de acento neón (cyan, magenta, lime), vibrante y tecnológico',
  'calido': 'Cálido — fondo marrón oscuro/burgundy, acentos cálidos (gold, amber, coral), acogedor',
  'frio': 'Frío — fondo navy/slate oscuro, acentos fríos (cyan, ice blue, teal), limpio y moderno',
  'editorial': 'Editorial — fondo claro crema/off-white, texto oscuro, acento sutil, estilo revista/impreso',
  'gradiente': 'Gradiente — fondo oscuro estándar pero con uso intensivo de gradientes CSS en acentos, cards y elementos decorativos',
};

/**
 * Get default palette for a category key.
 * Returns null for 'auto' or unknown categories.
 */
function getCategoryPalette(category) {
  if (!category || category === 'auto') return null;
  return CATEGORY_PALETTES[category] || null;
}

/**
 * Get human-readable description for a category.
 */
function getCategoryDescription(category) {
  if (!category || category === 'auto') return null;
  return CATEGORY_DESCRIPTIONS[category] || null;
}

module.exports = { DEFAULT_PALETTE, validatePalette, CATEGORY_PALETTES, getCategoryPalette, CATEGORY_DESCRIPTIONS, getCategoryDescription };
