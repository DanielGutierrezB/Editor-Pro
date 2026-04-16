const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

class TemplateManager {
  constructor() {
    this.templates = {};
    this._loadAll();
  }

  _loadAll() {
    const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.tsx'));
    files.forEach(f => {
      const type = f.replace('.tsx', '');
      this.templates[type] = fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf8');
    });
    console.log(`[TemplateManager] Loaded ${Object.keys(this.templates).length} templates`);
  }

  getTemplate(type) {
    return this.templates[type] || this.templates['title']; // fallback to title
  }

  /**
   * Match item labels/titles against transcript words to find accurate timestamps.
   * Returns item array with corrected time fields.
   */
  matchTimestamps(items, transcriptSegment, clipStartTime) {
    if (!items || !Array.isArray(items) || !transcriptSegment) return items;

    // Parse transcript lines: "[0.2s] Hay algo que..."
    const lines = transcriptSegment.split('\n');
    const wordTimestamps = [];

    lines.forEach(line => {
      const timeMatch = line.match(/\[(\d+\.?\d*)s?\]/);
      if (timeMatch) {
        const absTime = parseFloat(timeMatch[1]);
        const words = line.replace(/\[\d+\.?\d*s?\]\s*/, '').toLowerCase().split(/\s+/);
        words.forEach(w => {
          wordTimestamps.push({ word: w.replace(/[.,;:!?]/g, ''), absTime });
        });
      }
    });

    return items.map((item, i) => {
      // Get the key text from the item
      const searchText = (item.label || item.title || item.text || '').toLowerCase();
      const searchWords = searchText.split(/\s+/).filter(w => w.length > 3); // only significant words

      // Find the first matching word in the transcript
      let bestTime = null;
      for (const sw of searchWords) {
        const match = wordTimestamps.find(wt => wt.word.includes(sw) || sw.includes(wt.word));
        if (match) {
          bestTime = match.absTime - clipStartTime; // convert to relative time
          break;
        }
      }

      if (bestTime !== null && bestTime >= 0) {
        item.time = parseFloat(bestTime.toFixed(1));
      }

      return item;
    });
  }

  fillTemplate(type, contentValues, compositionId, durationFrames, proposalStartTime, transcriptSegment, customPalette) {
    let tsx = this.getTemplate(type);

    // Apply custom palette if provided
    if (customPalette) {
      tsx = this._applyCustomPalette(tsx, customPalette);
    }

    // Match timestamps for arrays with text
    const arrayKeysToMatch = ['ITEMS', 'CARDS_DATA', 'NODES', 'LIST_ITEMS', 'STEPS_DATA', 'STAGES', 'EVENTS', 'REVEAL_ITEMS', 'BARS', 'METRICS'];
    arrayKeysToMatch.forEach(key => {
      if (contentValues[key] && Array.isArray(contentValues[key])) {
        contentValues[key] = this.matchTimestamps(contentValues[key], transcriptSegment, proposalStartTime || 0);
      }
    });

    // Inject clip startTime for timestamp calculations
    tsx = tsx.replace(/const CLIP_START_TIME = .*?;/, `const CLIP_START_TIME = ${proposalStartTime || 0};`);

    // Replace string content values
    if (contentValues.TITLE) {
      tsx = tsx.replace(/const TITLE = ".*?";/, `const TITLE = ${JSON.stringify(contentValues.TITLE)};`);
    }
    if (contentValues.SUBTITLE) {
      tsx = tsx.replace(/const SUBTITLE = ".*?";/, `const SUBTITLE = ${JSON.stringify(contentValues.SUBTITLE)};`);
    }
    if (contentValues.ICON_NAME) {
      tsx = tsx.replace(/const ICON_NAME = ".*?";/, `const ICON_NAME = ${JSON.stringify(contentValues.ICON_NAME)};`);
    }
    if (contentValues.ACCENT_KEY) {
      tsx = tsx.replace(/const ACCENT_KEY = ".*?";/, `const ACCENT_KEY = ${JSON.stringify(contentValues.ACCENT_KEY)};`);
    }
    if (contentValues.PHRASE) {
      tsx = tsx.replace(/const PHRASE = ".*?";/, `const PHRASE = ${JSON.stringify(contentValues.PHRASE)};`);
    }

    // For arrays and objects — replace the entire declaration block
    // These match: const KEY = [...]; or const KEY = {...}; spanning multiple lines
    const complexKeys = ['ITEMS', 'STEPS_DATA', 'LIST_ITEMS', 'BARS', 'METRICS',
                         'SEGMENTS', 'CARDS_DATA', 'NODES', 'EVENTS', 'STAGES', 'FIELDS',
                         'REVEAL_ITEMS', 'POINTS', 'LEFT', 'RIGHT', 'BEFORE', 'AFTER'];

    complexKeys.forEach(key => {
      if (contentValues[key] !== undefined) {
        // Match multi-line: const KEY = [anything]; or const KEY = {anything};
        // Use a greedy approach: find "const KEY = " then match balanced brackets
        const startMarker = `const ${key} = `;
        const startIdx = tsx.indexOf(startMarker);
        if (startIdx === -1) return;

        const afterStart = startIdx + startMarker.length;
        const opener = tsx[afterStart]; // [ or {
        if (opener !== '[' && opener !== '{') return;

        const closer = opener === '[' ? ']' : '}';
        let depth = 0;
        let endIdx = afterStart;
        for (let i = afterStart; i < tsx.length; i++) {
          const ch = tsx[i];
          if (ch === opener) depth++;
          if (ch === closer) depth--;
          if (depth === 0) {
            endIdx = i + 1;
            break;
          }
        }

        // Find the semicolon after the closing bracket
        let semiIdx = endIdx;
        while (semiIdx < tsx.length && tsx[semiIdx] !== ';') semiIdx++;
        if (tsx[semiIdx] === ';') semiIdx++;

        const replacement = `const ${key} = ${JSON.stringify(contentValues[key], null, 2)};`;
        tsx = tsx.substring(0, startIdx) + replacement + tsx.substring(semiIdx);
      }
    });

    // Simple value replacements (numbers, strings)
    ['VALUE', 'TARGET', 'SUFFIX', 'LABEL', 'SUBLABEL', 'TOTAL_LABEL', 'VALUE_SUFFIX'].forEach(key => {
      if (contentValues[key] !== undefined) {
        const regex = new RegExp(`const ${key} = .*?;`);
        const val = typeof contentValues[key] === 'string' ? JSON.stringify(contentValues[key]) : contentValues[key];
        tsx = tsx.replace(regex, `const ${key} = ${val};`);
      }
    });

    // Replace export name with composition-specific name
    const compName = compositionId.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const safeCompName = /^\d/.test(compName) ? 'M' + compName : compName;
    tsx = tsx.replace(/export const MyComposition/g, `export const ${safeCompName}`);

    return tsx;
  }

  _applyCustomPalette(tsx, palette) {
    // Replace the C palette object values in template source
    // Uses regex to handle the const C = { ... } block
    if (palette.bg) tsx = tsx.replace(/bg:'#1a1d23'/g, `bg:'${palette.bg}'`);
    if (palette.card) tsx = tsx.replace(/card:'#2d323a'/g, `card:'${palette.card}'`);
    if (palette.accent) {
      tsx = tsx.replace(/accent:'#0ae98d'/g, `accent:'${palette.accent}'`);
      tsx = tsx.replace(/green:'#0ae98d'/g, `green:'${palette.accent}'`);
    }
    if (palette.text) tsx = tsx.replace(/text:'#ffffff'/g, `text:'${palette.text}'`);
    if (palette.dim) tsx = tsx.replace(/dim:'rgba\(255,255,255,0\.7\)'/g, `dim:'${palette.dim}'`);
    if (palette.border) tsx = tsx.replace(/border:'rgba\(255,255,255,0\.08\)'/g, `border:'${palette.border}'`);
    if (palette.glow) tsx = tsx.replace(/glow:'rgba\(10,233,141,0\.08\)'/g, `glow:'${palette.glow}'`);
    return tsx;
  }

  listTypes() {
    return Object.keys(this.templates);
  }
}

module.exports = TemplateManager;
