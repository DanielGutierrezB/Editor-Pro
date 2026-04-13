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

  fillTemplate(type, contentValues, compositionId, durationFrames) {
    let tsx = this.getTemplate(type);

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

  listTypes() {
    return Object.keys(this.templates);
  }
}

module.exports = TemplateManager;
