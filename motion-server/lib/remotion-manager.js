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
    // Pre-render validation: check imports against known packages
    const validationResult = this._validateImports(tsxCode);
    if (validationResult.fixedCode) {
      tsxCode = validationResult.fixedCode;
    }

    const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
    fs.writeFileSync(filePath, tsxCode, 'utf8');

    // Calculate actual duration from TSX content (more reliable than proposal duration)
    const actualDuration = this._calculateDuration(tsxCode, durationFrames);
    this._registerInRoot(compositionId, actualDuration);
    return filePath;
  }

  /**
   * Validate imports in TSX code against known safe packages.
   * Returns { valid, errors[], fixedCode? }
   */
  _validateImports(tsxCode) {
    const ALLOWED_PACKAGES = {
      'remotion': ['AbsoluteFill', 'useCurrentFrame', 'useVideoConfig', 'interpolate', 'spring', 'Sequence', 'Img', 'Audio', 'Easing', 'random', 'continueRender', 'delayRender'],
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

    if (errors.length > 0) {
      console.warn('[RemotionManager] Import validation warnings:', errors);
      return { valid: false, errors, fixedCode };
    }
    return { valid: true, errors: [] };
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
        fs.copyFileSync(path.join(srcFolder, f), path.join(this.compositionsDir, f));
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

    // Re-register all compositions currently in the dir
    const files = fs.readdirSync(this.compositionsDir).filter(f => f.endsWith('.tsx'));
    files.forEach(f => {
      const id = f.replace('.tsx', '');
      const content = fs.readFileSync(path.join(this.compositionsDir, f), 'utf8');
      let totalFrames = 300;

      // Method 1: Traditional <Sequence from={X} durationInFrames={Y}>
      let maxEnd = 0;
      const fromDur = content.match(/<Sequence\s+from=\{(\d+)\}\s+durationInFrames=\{(\d+)\}/g) || [];
      fromDur.forEach(m => {
        const match = m.match(/from=\{(\d+)\}\s+durationInFrames=\{(\d+)\}/);
        if (match) {
          const end = parseInt(match[1]) + parseInt(match[2]);
          if (end > maxEnd) maxEnd = end;
        }
      });

      // Method 2: TransitionSeries — sum ALL durationInFrames values (they're sequential)
      if (maxEnd === 0 && content.indexOf('TransitionSeries') !== -1) {
        const allDurs = content.match(/durationInFrames=\{(\d+)\}/g) || [];
        let sum = 0;
        allDurs.forEach(d => {
          const val = d.match(/(\d+)/);
          if (val) sum += parseInt(val[1]);
        });
        if (sum > 0) maxEnd = sum;
      }

      // Method 3: If still 0, find ALL durationInFrames and use the largest sum
      if (maxEnd === 0) {
        const allDurs = content.match(/durationInFrames=\{(\d+)\}/g) || [];
        allDurs.forEach(d => {
          const val = parseInt(d.match(/(\d+)/)[1]);
          if (val > maxEnd) maxEnd = val;
        });
      }

      if (maxEnd > 0) totalFrames = maxEnd + 6;
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
    // H.264 + yuv420p: Premiere suele fallar al leer fotogramas en ProRes .mov generado por Remotion (sustituye frames / franjas rayadas).
    const outputPath = path.join(rendersDir, `${compositionId}.mp4`);

    const npxPath = execSync('which npx', { encoding: 'utf8' }).trim();
    const args = [
      'remotion', 'render',
      path.join(this.projectPath, 'src', 'index.ts'),
      compositionId,
      outputPath,
      '--codec=h264',
      '--pixel-format=yuv420p',
      '--muted',
      '--image-format=png',
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
                '  renders/   → Videos renderizados (.mp4 H.264, importados a Premiere)',
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
        callback(new Error(`Render failed (code ${code}): ${stderr || stdout}`));
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
