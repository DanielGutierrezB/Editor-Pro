/**
 * tsx-validator.js — Validates AI-generated TSX code before bundling.
 * Handles: import validation against allowed packages, syntax validation
 * (strings, brackets), and auto-fix for common issues.
 */

const ALLOWED_PACKAGES = {
  'remotion': ['AbsoluteFill', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'Sequence', 'Img', 'Audio', 'Easing', 'random', 'continueRender', 'delayRender', 'staticFile', 'getInputProps'],
  'react': null, // allow all
  'lucide-react': null, // allow all icons
  '@remotion/transitions': ['TransitionSeries', 'linearTiming'],
  '@remotion/transitions/fade': ['fade'],
  '@remotion/transitions/slide': ['slide'],
  '@remotion/shapes': ['Rect', 'Circle', 'Triangle', 'Star', 'Pie'],
  '@remotion/paths': ['evolvePath', 'getLength', 'getPointAtLength', 'parsePath', 'resetPath', 'scalePath', 'translatePath'],
  '@remotion/noise': ['noise2D', 'noise3D'],
  '@remotion/motion-blur': ['Trail'],
  '@fontsource/dm-sans/400.css': null,
  '@fontsource/dm-sans/500.css': null,
  '@fontsource/dm-sans/600.css': null,
  '@fontsource/dm-sans/700.css': null,
};

class TsxValidator {
  /**
   * Validate imports against known safe packages.
   * Returns { valid, errors[], fixedCode? }
   */
  validateImports(tsxCode) {
    const errors = [];
    let fixedCode = tsxCode;
    const importRegex = /^import\s+(?:(?:\{[^}]*\}|[^;{]*)\s+from\s+)?['"]([^'"]+)['"]/gm;
    let match;
    while ((match = importRegex.exec(tsxCode)) !== null) {
      const pkg = match[1];
      if (pkg.endsWith('.css')) {
        if (!ALLOWED_PACKAGES[pkg]) {
          if (!pkg.startsWith('@fontsource/dm-sans')) {
            errors.push(`Unknown CSS import: ${pkg}`);
            fixedCode = fixedCode.replace(match[0], '// REMOVED unknown import: ' + match[0]);
          }
        }
        continue;
      }
      if (!ALLOWED_PACKAGES.hasOwnProperty(pkg)) {
        errors.push(`Unknown package: ${pkg}`);
        fixedCode = fixedCode.replace(match[0], '// REMOVED unknown import: ' + match[0]);
      }
    }

    // Clean up Img import from 'remotion' if no valid <Img usages remain
    if (/<Img\b/.test(fixedCode) === false) {
      fixedCode = fixedCode.replace(
        /(import\s*\{[^}]*)(?:,\s*Img\b|\bImg\s*,\s*)([^}]*\}\s*from\s*['"]remotion['"])/,
        '$1$2'
      );
    }

    if (errors.length > 0) {
      console.warn('[TsxValidator] Import validation warnings:', errors);
      return { valid: false, errors, fixedCode };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Basic syntax validation — catch issues BEFORE bundling so one bad file
   * doesn't take down the entire Remotion project.
   */
  validateSyntax(tsxCode) {
    const errors = [];

    // String validation
    let inString = false;
    let stringChar = '';
    let stringStartLine = 0;

    for (let i = 0; i < tsxCode.length; i++) {
      const ch = tsxCode[i];
      const prev = i > 0 ? tsxCode[i - 1] : '';

      if (!inString && (ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
        inString = true;
        stringChar = ch;
        stringStartLine = tsxCode.substring(0, i).split('\n').length;
        continue;
      }
      if (inString && ch === stringChar && prev !== '\\') {
        inString = false;
        continue;
      }
      if (inString && (stringChar === '"' || stringChar === "'") && ch === '\n') {
        errors.push(`Line ${stringStartLine}: Unterminated ${stringChar === '"' ? 'double' : 'single'}-quoted string`);
        inString = false;
      }
    }
    if (inString) {
      errors.push(`Unterminated ${stringChar === '`' ? 'template literal' : 'string'} starting at line ${stringStartLine}`);
    }

    // Bracket balance
    inString = false;
    stringChar = '';
    const brackets = { '(': 0, '{': 0, '[': 0 };
    const closers = { ')': '(', '}': '{', ']': '[' };

    for (let i = 0; i < tsxCode.length; i++) {
      const ch = tsxCode[i];
      const prev = i > 0 ? tsxCode[i - 1] : '';

      if (!inString && (ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
        inString = true; stringChar = ch; continue;
      }
      if (inString && ch === stringChar && prev !== '\\') {
        inString = false; continue;
      }
      if (inString) continue;
      if (ch === '/' && tsxCode[i + 1] === '/') {
        const nl = tsxCode.indexOf('\n', i);
        i = nl === -1 ? tsxCode.length : nl;
        continue;
      }

      if (brackets.hasOwnProperty(ch)) brackets[ch]++;
      if (closers[ch]) brackets[closers[ch]]--;
    }

    if (brackets['('] !== 0) errors.push(`Unbalanced parentheses: ${brackets['(']} unclosed`);
    if (brackets['{'] !== 0) errors.push(`Unbalanced braces: ${brackets['{']} unclosed`);
    if (brackets['['] !== 0) errors.push(`Unbalanced brackets: ${brackets['[']} unclosed`);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Attempt to auto-fix common syntax issues in AI-generated TSX.
   */
  autoFixSyntax(tsxCode) {
    const lines = tsxCode.split('\n');
    const fixedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      for (const q of ['"', "'"]) {
        const stripped = line.replace(/\\./g, '__');
        const count = (stripped.split(q).length - 1);
        if (count % 2 !== 0 && !stripped.includes('`')) {
          const lastIdx = line.lastIndexOf(q);
          const afterQuote = line.slice(lastIdx + 1).trim();
          if (afterQuote === '' || afterQuote === '>' || afterQuote === '/>') {
            const trailing = line.slice(lastIdx + 1);
            line = line.slice(0, lastIdx + 1) + q + trailing;
            console.log(`[TsxValidator] Auto-fixed unterminated ${q} on line ${i + 1}`);
          }
        }
      }

      fixedLines.push(line);
    }

    return fixedLines.join('\n');
  }
}

module.exports = TsxValidator;
