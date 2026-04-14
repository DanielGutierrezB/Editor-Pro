/**
 * Remotion Manager — writes TSX compositions and manages Root.tsx registry
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class RemotionManager {
  constructor(renderProjectPath) {
    this.projectPath = renderProjectPath;
    this.compositionsDir = path.join(renderProjectPath, 'src', 'compositions');
    this.rootTsxPath = path.join(renderProjectPath, 'src', 'Root.tsx');
    this.outputDir = path.join(renderProjectPath, 'out');

    if (!fs.existsSync(this.compositionsDir)) {
      fs.mkdirSync(this.compositionsDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  writeComposition(compositionId, tsxCode, durationFrames) {
    // Sanitize: strip brandfetch URLs before any processing
    tsxCode = this._stripBrandfetch(tsxCode);

    // Strip @remotion/motion-blur Trail — it crashes renders when trailOpacity is missing
    tsxCode = this._stripTrail(tsxCode);

    // Strip TransitionSeries with fade — replace with plain Sequence blocks
    tsxCode = this._stripFadeTransitions(tsxCode);

    // Replace lucide icons with brand SVG logos when applicable
    tsxCode = this._replaceBrandIcons(tsxCode);

    // Pre-render validation: check imports against known packages
    const validationResult = this._validateImports(tsxCode);
    if (validationResult.fixedCode) {
      tsxCode = validationResult.fixedCode;
    }

    // Syntax pre-check: catch unterminated strings, brackets, etc.
    const syntaxResult = this._validateSyntax(tsxCode);
    if (!syntaxResult.valid) {
      console.error(`[RemotionManager] Syntax errors in ${compositionId}:`, syntaxResult.errors);
      // Attempt auto-fix for common issues
      tsxCode = this._autoFixSyntax(tsxCode);
      const recheck = this._validateSyntax(tsxCode);
      if (!recheck.valid) {
        console.error(`[RemotionManager] Could not auto-fix ${compositionId}, skipping registration`);
        // Write the file but DON'T register in Root.tsx — this prevents it from breaking other renders
        const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
        fs.writeFileSync(filePath, tsxCode, 'utf8');
        return { filePath, syntaxError: true, errors: recheck.errors };
      }
    }

    const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
    fs.writeFileSync(filePath, tsxCode, 'utf8');

    // Use proposal duration directly (templates use durationInFrames from useVideoConfig)
    this._registerInRoot(compositionId, durationFrames);
    // Save duration metadata so _rebuildRoot can use the correct duration
    const metaPath = path.join(this.compositionsDir, `${compositionId}.duration`);
    fs.writeFileSync(metaPath, String(durationFrames), 'utf8');
    return filePath;
  }

  /**
   * Strip brandfetch URLs and replace with lucide-react Globe icon.
   * Prevents render failures from external CDN dependencies.
   */
  _stripBrandfetch(tsxCode) {
    // Check if there are any brandfetch references
    if (!/brandfetch/i.test(tsxCode)) return tsxCode;

    console.log('[RemotionManager] Stripping brandfetch references from TSX');

    // Replace <Img src="...brandfetch..." .../> or <Img src={"...brandfetch..."} .../> with Globe icon
    tsxCode = tsxCode.replace(/<Img\s+[^>]*(?:src=\{?["'][^"']*brandfetch[^"']*["']\}?)[^>]*\/?>/gi,
      '<Globe size={60} color={C.accent} />');

    // Replace any remaining lines containing brandfetch URLs
    tsxCode = tsxCode.replace(/.*https?:\/\/[^\s]*brandfetch[^\s]*.*$/gm, '// [REMOVED: brandfetch URL not available]');

    // Ensure Globe is imported from lucide-react
    if (tsxCode.includes('<Globe') && !/import\s*\{[^}]*Globe[^}]*\}\s*from\s*['"]lucide-react['"]/.test(tsxCode)) {
      // Check if there's already a lucide-react import to extend
      const lucideImportMatch = tsxCode.match(/^(import\s*\{)([^}]*)\}\s*from\s*['"]lucide-react['"]/m);
      if (lucideImportMatch) {
        const existingImports = lucideImportMatch[2].trim();
        tsxCode = tsxCode.replace(lucideImportMatch[0],
          `import { ${existingImports}, Globe } from 'lucide-react'`);
      } else {
        // Add new lucide-react import after the last import line
        tsxCode = tsxCode.replace(/(^import\s+.*$(?![\s\S]*^import\s))/m,
          "$1\nimport { Globe } from 'lucide-react';");
      }
    }

    return tsxCode;
  }

  /**
   * Strip @remotion/motion-blur Trail component — AI frequently omits required trailOpacity prop
   * causing render crashes. Replace Trail wrappers with plain divs.
   */
  _stripTrail(tsxCode) {
    if (!/Trail/i.test(tsxCode) || !/@remotion\/motion-blur/.test(tsxCode)) return tsxCode;
    
    console.log('[RemotionManager] Stripping Trail from TSX (crash prevention)');
    
    // Remove the import
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*Trail[^}]*\}\s*from\s*['"]@remotion\/motion-blur['"];?\s*$/gm, '// REMOVED: @remotion/motion-blur (crash prevention)');
    
    // Replace <Trail ...> with <div> and </Trail> with </div>
    tsxCode = tsxCode.replace(/<Trail\b[^>]*>/g, '<div>');
    tsxCode = tsxCode.replace(/<\/Trail>/g, '</div>');
    
    return tsxCode;
  }

  /**
   * Strip TransitionSeries + fade() usage. The AI keeps using crossfade despite
   * prompt prohibitions. Replace with plain <Sequence> blocks.
   */
  _stripFadeTransitions(tsxCode) {
    if (!/TransitionSeries/.test(tsxCode)) return tsxCode;
    
    console.log('[RemotionManager] Stripping TransitionSeries/fade from TSX');
    
    // Remove fade import
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*fade[^}]*\}\s*from\s*['"]@remotion\/transitions\/fade['"];?\s*$/gm, 
      '// REMOVED: fade transition (hard cuts enforced)');
    
    // Replace TransitionSeries.Sequence with Sequence
    tsxCode = tsxCode.replace(/<TransitionSeries\.Sequence\b/g, '<Sequence');
    tsxCode = tsxCode.replace(/<\/TransitionSeries\.Sequence>/g, '</Sequence>');
    
    // Remove TransitionSeries.Transition elements entirely
    tsxCode = tsxCode.replace(/<TransitionSeries\.Transition[\s\S]*?\/>/g, '');
    
    // Replace TransitionSeries wrapper with fragment
    tsxCode = tsxCode.replace(/<TransitionSeries\b[^>]*>/g, '<>');
    tsxCode = tsxCode.replace(/<\/TransitionSeries>/g, '</>');
    
    // Remove TransitionSeries import
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*TransitionSeries[^}]*\}\s*from\s*['"]@remotion\/transitions['"];?\s*$/gm,
      '// REMOVED: TransitionSeries (hard cuts enforced)');
    
    return tsxCode;
  }

  /**
   * Replace lucide-react icons used for known brands with local SVG logos.
   * The AI often uses Globe, Facebook, Camera etc. instead of actual brand logos.
   */
  _replaceBrandIcons(tsxCode) {
    const brandMap = {
      'meta': { icons: ['Globe', 'Building', 'Layers'], svg: 'meta.svg' },
      'facebook': { icons: ['Facebook', 'ThumbsUp'], svg: 'facebook.svg' },
      'instagram': { icons: ['Camera', 'Image', 'Aperture'], svg: 'instagram.svg' },
      'whatsapp': { icons: ['MessageCircle', 'Phone', 'MessageSquare'], svg: 'whatsapp.svg' },
      'google': { icons: ['Search', 'Chrome'], svg: 'google.svg' },
      'youtube': { icons: ['Play', 'Video', 'PlayCircle'], svg: 'youtube.svg' },
      'tiktok': { icons: ['Music', 'Film'], svg: 'tiktok.svg' },
      'linkedin': { icons: ['Linkedin', 'Briefcase'], svg: 'linkedin.svg' },
      'twitter': { icons: ['Twitter', 'AtSign', 'Bird'], svg: 'twitter.svg' },
      'telegram': { icons: ['Send', 'MessageCircle'], svg: 'telegram.svg' },
      'slack': { icons: ['Hash', 'MessageSquare'], svg: 'slack.svg' },
      'github': { icons: ['Github', 'Code'], svg: 'github.svg' },
      'apple': { icons: ['Apple', 'Smartphone'], svg: 'apple.svg' },
      'microsoft': { icons: ['Monitor', 'Grid'], svg: 'microsoft.svg' },
      'amazon': { icons: ['ShoppingCart', 'Package'], svg: 'amazon.svg' },
      'netflix': { icons: ['Film', 'Tv'], svg: 'netflix.svg' },
      'spotify': { icons: ['Music', 'Headphones'], svg: 'spotify.svg' },
    };

    let changed = false;
    const availableLogos = fs.readdirSync(path.join(this.projectPath, 'public', 'logos')).filter(f => f.endsWith('.svg'));

    Object.keys(brandMap).forEach(brand => {
      const regex = new RegExp(brand, 'i');
      if (!regex.test(tsxCode)) return;
      
      const svgFile = brandMap[brand].svg;
      // Only replace if we have the SVG file
      if (!availableLogos.includes(svgFile)) return;
      
      // Already using the correct SVG
      if (tsxCode.includes("staticFile('logos/" + svgFile + "')")) return;
      
      // Replace lucide icons that represent this brand with the real SVG
      brandMap[brand].icons.forEach(icon => {
        // Match <IconName size={...} color={...} .../> patterns
        const iconRegex = new RegExp('<' + icon + '\\s+[^>]*\\/>', 'g');
        const before = tsxCode;
        tsxCode = tsxCode.replace(iconRegex, 
          `<Img src={staticFile('logos/${svgFile}')} style={{width:60,height:60,objectFit:'contain'}} />`);
        if (tsxCode !== before) {
          console.log(`[RemotionManager] Replacing <${icon}/> with ${svgFile} for brand "${brand}"`);
          changed = true;
        }
      });
    });

    if (changed) {
      // Ensure staticFile and Img are imported
      if (!/\bstaticFile\b/.test(tsxCode.match(/import\s*\{[^}]*\}\s*from\s*['"]remotion['"]/)?.[0] || '')) {
        tsxCode = tsxCode.replace(
          /(import\s*\{)([^}]*)(}\s*from\s*['"]remotion['"])/,
          (m, p1, p2, p3) => {
            let imports = p2;
            if (!imports.includes('staticFile')) imports += ', staticFile';
            if (!imports.includes('Img')) imports += ', Img';
            return p1 + imports + p3;
          }
        );
      }
      console.log('[RemotionManager] Brand icons replaced with local SVGs');
    }

    return tsxCode;
  }

  /**
   * Validate imports in TSX code against known safe packages.
   * Returns { valid, errors[], fixedCode? }
   */
  _validateImports(tsxCode) {
    const ALLOWED_PACKAGES = {
      'remotion': ['AbsoluteFill', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'Sequence', 'Img', 'Audio', 'Easing', 'random', 'continueRender', 'delayRender', 'staticFile'],
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

    const errors = [];
    let fixedCode = tsxCode;
    // Match: import { ... } from 'package'; or import ... from 'package';
    const importRegex = /^import\s+(?:(?:\{[^}]*\}|[^;{]*)\s+from\s+)?['"]([^'"]+)['"]/gm;
    let match;
    while ((match = importRegex.exec(tsxCode)) !== null) {
      const pkg = match[1];
      // Allow CSS imports
      if (pkg.endsWith('.css')) {
        if (!ALLOWED_PACKAGES[pkg]) {
          // Only allow @fontsource/dm-sans CSS
          if (!pkg.startsWith('@fontsource/dm-sans')) {
            errors.push(`Unknown CSS import: ${pkg}`);
            fixedCode = fixedCode.replace(match[0], '// REMOVED unknown import: ' + match[0]);
          }
        }
        continue;
      }
      if (!ALLOWED_PACKAGES.hasOwnProperty(pkg)) {
        errors.push(`Unknown package: ${pkg}`);
        // Comment out the bad import instead of failing
        fixedCode = fixedCode.replace(match[0], '// REMOVED unknown import: ' + match[0]);
      }
    }

    // Clean up Img import from 'remotion' if no valid <Img usages remain
    // (brandfetch stripping may have removed all <Img> uses)
    if (/<Img\b/.test(fixedCode) === false) {
      // Remove Img from remotion import: import { ..., Img, ... } from 'remotion'
      fixedCode = fixedCode.replace(
        /(import\s*\{[^}]*)(?:,\s*Img\b|\bImg\s*,\s*)([^}]*\}\s*from\s*['"]remotion['"])/,
        '$1$2'
      );
    }

    if (errors.length > 0) {
      console.warn('[RemotionManager] Import validation warnings:', errors);
      return { valid: false, errors, fixedCode };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Basic syntax validation — catch issues BEFORE bundling so one bad file
   * doesn't take down the entire Remotion project.
   */
  _validateSyntax(tsxCode) {
    const errors = [];

    // STEP 1: String and bracket validation (TSX-safe, no JS parsing needed)
    // Check all string types (single, double, backtick) balance
    let inString = false;
    let stringChar = '';
    let stringStartLine = 0;

    const lines = tsxCode.split('\n');
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
      // For single/double quotes: they can't span lines in JS/TSX
      if (inString && (stringChar === '"' || stringChar === "'") && ch === '\n') {
        errors.push(`Line ${stringStartLine}: Unterminated ${stringChar === '"' ? 'double' : 'single'}-quoted string`);
        inString = false; // reset to continue checking
      }
    }
    if (inString) {
      errors.push(`Unterminated ${stringChar === '`' ? 'template literal' : 'string'} starting at line ${stringStartLine}`);
    }

    // STEP 4: Bracket balance
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
  _autoFixSyntax(tsxCode) {
    const lines = tsxCode.split('\n');
    const fixedLines = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Fix unterminated string literals: if a line has an odd number of
      // unescaped quotes and doesn't continue on the next line, close it
      for (const q of ['"', "'"]) {
        const stripped = line.replace(/\\./g, '__');
        const count = (stripped.split(q).length - 1);
        if (count % 2 !== 0 && !stripped.includes('`')) {
          // Find the last occurrence of the quote and check if string is unclosed
          const lastIdx = line.lastIndexOf(q);
          // Check if this is a dangling open quote near end of line
          const afterQuote = line.slice(lastIdx + 1).trim();
          if (afterQuote === '' || afterQuote === '>' || afterQuote === '/>') {
            // Insert closing quote before the trailing characters
            line = line.slice(0, lastIdx + 1) + line.slice(lastIdx + 1).replace(/^/, q);
            console.log(`[RemotionManager] Auto-fixed unterminated ${q} on line ${i + 1}`);
          }
        }
      }

      fixedLines.push(line);
    }

    return fixedLines.join('\n');
  }

  _calculateDuration(tsxCode, fallback) {
    // <Sequence from={X} durationInFrames={Y}> — max(from+dur), incl. saltos de línea entre atributos
    let maxEnd = 0;
    const reSeq = /<Sequence[\s\S]*?from=\{(\d+)\}[\s\S]*?durationInFrames=\{(\d+)\}/g;
    let m;
    while ((m = reSeq.exec(tsxCode)) !== null) {
      const end = parseInt(m[1], 10) + parseInt(m[2], 10);
      if (end > maxEnd) maxEnd = end;
    }

    // Method 2: TransitionSeries — sum all durationInFrames (sequential)
    if (maxEnd === 0 && tsxCode.indexOf('TransitionSeries') !== -1) {
      const allDurs = tsxCode.match(/durationInFrames=\{(\d+)\}/g) || [];
      let sum = 0;
      allDurs.forEach(d => {
        const val = d.match(/(\d+)/);
        if (val) sum += parseInt(val[1]);
      });
      if (sum > 0) maxEnd = sum;
    }

    // Use the larger of: calculated vs proposal duration
    const calculated = maxEnd > 0 ? maxEnd + 6 : 0;
    return Math.max(calculated, fallback || 300);
  }

  _registerInRoot(compositionId, durationFrames) {
    // Verify the TSX file actually exists before registering
    const tsxPath = path.join(this.compositionsDir, `${compositionId}.tsx`);
    if (!fs.existsSync(tsxPath)) {
      console.warn(`[RemotionManager] Skipping registration of ${compositionId} — TSX file not found`);
      return;
    }

    let root = fs.readFileSync(this.rootTsxPath, 'utf8');

    const componentName = this._componentName(compositionId);
    const importLine = `import { ${componentName} } from './compositions/${compositionId}';`;
    const compBlock = `      <Composition id="${compositionId}" component={${componentName}} durationInFrames={${durationFrames}} fps={30} width={1920} height={1080} />`;

    if (!root.includes(importLine)) {
      root = root.replace(
        '// === DYNAMIC IMPORTS END ===',
        `${importLine}\n// === DYNAMIC IMPORTS END ===`
      );
    }

    if (!root.includes(`id="${compositionId}"`)) {
      root = root.replace(
        '{/* === DYNAMIC COMPOSITIONS END === */}',
        `${compBlock}\n      {/* === DYNAMIC COMPOSITIONS END === */}`
      );
    }

    fs.writeFileSync(this.rootTsxPath, root, 'utf8');
  }

  /**
   * Remove a broken composition from Root.tsx so it doesn't poison other renders.
   */
  _deregisterFromRoot(compositionId) {
    if (!fs.existsSync(this.rootTsxPath)) return;
    let root = fs.readFileSync(this.rootTsxPath, 'utf8');

    const componentName = this._componentName(compositionId);
    // Remove import line
    const importRe = new RegExp(`^import\\s*\\{\\s*${componentName}\\s*\\}.*\\n?`, 'm');
    root = root.replace(importRe, '');
    // Remove composition line
    const compRe = new RegExp(`^\\s*<Composition\\s+id="${compositionId.replace(/[-]/g, '\\-')}"[^>]*/>\\n?`, 'm');
    root = root.replace(compRe, '');

    fs.writeFileSync(this.rootTsxPath, root, 'utf8');
    console.log(`[RemotionManager] Deregistered broken composition: ${compositionId}`);
  }

  _componentName(compositionId) {
    let name = compositionId
      .split(/[-_]/)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
    // JS identifiers can't start with a digit — prefix with "M"
    if (/^\d/.test(name)) name = 'M' + name;
    return name;
  }

  syncFromSession(sessionDir) {
    if (!sessionDir || !fs.existsSync(sessionDir)) return;

    // Clear current compositions
    if (fs.existsSync(this.compositionsDir)) {
      const files = fs.readdirSync(this.compositionsDir).filter(f => f.endsWith('.tsx'));
      files.forEach(f => fs.unlinkSync(path.join(this.compositionsDir, f)));
    }

    // Copy session TSX sources into Remotion project
    // Check both 'src/' (new) and 'compositions/' (legacy) locations
    const sessionSrc = path.join(sessionDir, 'src');
    const sessionCompsLegacy = path.join(sessionDir, 'compositions');
    const srcFolder = fs.existsSync(sessionSrc) ? sessionSrc : fs.existsSync(sessionCompsLegacy) ? sessionCompsLegacy : null;
    if (srcFolder) {
      const files = fs.readdirSync(srcFolder).filter(f => f.endsWith('.tsx'));
      files.forEach(f => {
        // Validate syntax BEFORE copying — don't let broken files from previous sessions poison the build
        const content = fs.readFileSync(path.join(srcFolder, f), 'utf8');
        const syntaxCheck = this._validateSyntax(content);
        if (!syntaxCheck.valid) {
          console.warn(`[RemotionManager] Skipping broken session file ${f}:`, syntaxCheck.errors);
          // Also remove the broken file from the session to prevent it from re-infecting
          try { fs.unlinkSync(path.join(srcFolder, f)); } catch(_e) {}
          return; // skip this file
        }
        fs.copyFileSync(path.join(srcFolder, f), path.join(this.compositionsDir, f));
        // Also copy duration metadata if it exists
        const durationFile = f.replace('.tsx', '.duration');
        const durationPath = path.join(srcFolder, durationFile);
        if (fs.existsSync(durationPath)) {
          fs.copyFileSync(durationPath, path.join(this.compositionsDir, durationFile));
        }
      });
    }

    // Rebuild Root.tsx from scratch
    this._rebuildRoot();
  }

  saveToSession(compositionId, sessionDir) {
    if (!sessionDir) return;
    const srcDir = path.join(sessionDir, 'src');
    if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

    const src = path.join(this.compositionsDir, `${compositionId}.tsx`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(srcDir, `${compositionId}.tsx`));
    }
    // Also copy duration metadata
    const metaSrc = path.join(this.compositionsDir, `${compositionId}.duration`);
    if (fs.existsSync(metaSrc)) {
      fs.copyFileSync(metaSrc, path.join(srcDir, `${compositionId}.duration`));
    }
  }

  _rebuildRoot() {
    // Write a clean Root.tsx
    let root = [
      "import React from 'react';",
      "import { Composition } from 'remotion';",
      "// === DYNAMIC IMPORTS START ===",
      "// === DYNAMIC IMPORTS END ===",
      "",
      "export const RemotionRoot: React.FC = () => {",
      "  return (",
      "    <>",
      "      {/* === DYNAMIC COMPOSITIONS START === */}",
      "      {/* === DYNAMIC COMPOSITIONS END === */}",
      "    </>",
      "  );",
      "};",
    ].join('\n');

    fs.writeFileSync(this.rootTsxPath, root, 'utf8');

    // Re-register all compositions currently in the dir (skip those with syntax errors)
    const files = fs.readdirSync(this.compositionsDir).filter(f => f.endsWith('.tsx'));
    files.forEach(f => {
      const id = f.replace('.tsx', '');
      const content = fs.readFileSync(path.join(this.compositionsDir, f), 'utf8');

      // Validate syntax before registering — don't let a broken file poison Root.tsx
      const syntaxCheck = this._validateSyntax(content);
      if (!syntaxCheck.valid) {
        console.warn(`[RemotionManager] Skipping ${id} during rebuild — syntax errors:`, syntaxCheck.errors);
        return; // skip this file
      }

      // Read saved duration from metadata file (set during writeComposition)
      const metaPath = path.join(this.compositionsDir, `${id}.duration`);
      let totalFrames = 300;
      if (fs.existsSync(metaPath)) {
        const saved = parseInt(fs.readFileSync(metaPath, 'utf8').trim(), 10);
        if (saved > 0) totalFrames = saved;
      } else {
        // Fallback: try to parse from TSX (for old compositions without metadata)
        let maxEnd = 0;
        const fromDur = content.match(/<Sequence\s+from=\{(\d+)\}\s+durationInFrames=\{(\d+)\}/g) || [];
        fromDur.forEach(m => {
          const match = m.match(/from=\{(\d+)\}\s+durationInFrames=\{(\d+)\}/);
          if (match) {
            const end = parseInt(match[1]) + parseInt(match[2]);
            if (end > maxEnd) maxEnd = end;
          }
        });
        if (maxEnd > 0) totalFrames = maxEnd + 6;
      }
      this._registerInRoot(id, totalFrames);
    });
  }

  render(compositionId, callback, customOutputDir) {
    const sessionDir = customOutputDir || this.outputDir;
    // Renders go into renders/ subfolder
    const rendersDir = customOutputDir ? path.join(sessionDir, 'renders') : sessionDir;
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }
    // H.264 + yuv420p: ProRes intra-frame: cada frame es independiente, elimina frame corruption de H.264 inter-frame.
    const outputPath = path.join(rendersDir, `${compositionId}.mp4`);

    let npxPath;
    try { npxPath = execSync('which npx', { encoding: 'utf8' }).trim(); } catch(_e) { npxPath = 'npx'; }
    const args = [
      'remotion', 'render',
      path.join(this.projectPath, 'src', 'index.ts'),
      compositionId,
      outputPath,
      '--codec=h264',
      '--pixel-format=yuv420p',
      '--crf=15',
      
      
      '--muted',
      '--image-format=jpeg',
      '--jpeg-quality=100',
      '--concurrency=1',
      '--timeout=60000',
      '--delay-render-timeout=30000',
    ];

    const proc = spawn(npxPath, args, {
      cwd: this.projectPath,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      const altPath = outputPath + '.mp4';
      const finalPath = fs.existsSync(outputPath)
        ? outputPath
        : fs.existsSync(altPath)
          ? altPath
          : null;
      if (code === 0 && finalPath) {
        // Write README in session root if this is a project folder
        if (customOutputDir) {
          const readmePath = path.join(sessionDir, 'README.txt');
          if (!fs.existsSync(readmePath)) {
            try {
              fs.writeFileSync(readmePath, [
                'Motion-Pro — Sesión de Motion Graphics',
                '======================================',
                '',
                'Estructura:',
                '  renders/   → Videos renderizados (.mov ProRes, importados a Premiere)',
                '  src/       → Código fuente editable (.tsx Remotion/React)',
                '  feedback/  → Imágenes de referencia capturadas',
                '  FEEDBACK.md → Log de feedback enviado',
                '',
                'Para editar manualmente:',
                '  1. Abre terminal en motion-render/ del plugin',
                '  2. npx remotion studio',
                '  3. Edita el .tsx y re-renderiza',
                '',
              ].join('\n'), 'utf8');
            } catch(_e) {}
          }
        }
        callback(null, { mp4Path: finalPath, compositionId });
      } else {
        const errorMsg = stderr || stdout;
        // If the error is a build/syntax error, find which .tsx file caused it
        // and deregister it from Root.tsx so subsequent renders aren't blocked
        const buildErrorMatch = errorMsg.match(/compositions\/([^:]+\.tsx):\d+:\d+: ERROR:/);
        if (buildErrorMatch) {
          const brokenFile = buildErrorMatch[1].replace('.tsx', '');
          console.error(`[RemotionManager] Build error in ${brokenFile}, deregistering from Root.tsx`);
          this._deregisterFromRoot(brokenFile);
          // Also remove the broken file to prevent it from being re-registered
          const brokenPath = path.join(this.compositionsDir, buildErrorMatch[1]);
          if (fs.existsSync(brokenPath)) {
            try { fs.unlinkSync(brokenPath); } catch(_e) {}
          }
        }
        callback(new Error(`Render failed (code ${code}): ${errorMsg}`));
      }
    });

    proc.on('error', (err) => {
      callback(new Error('Spawn error: ' + err.message));
    });

    return proc;
  }

  startStudio(callback) {
    let npxPath;
    try { npxPath = execSync('which npx', { encoding: 'utf8' }).trim(); } catch(_e) { npxPath = 'npx'; }
    const proc = spawn(npxPath, ['remotion', 'studio'], {
      cwd: this.projectPath,
      shell: false,
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    setTimeout(() => {
      callback(null, { url: 'http://localhost:3000', pid: proc.pid });
    }, 2000);
  }

  getCompositionTsx(compositionId) {
    const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  listCompositions() {
    if (!fs.existsSync(this.compositionsDir)) return [];
    return fs.readdirSync(this.compositionsDir)
      .filter(f => f.endsWith('.tsx'))
      .map(f => f.replace('.tsx', ''));
  }
}

module.exports = RemotionManager;
