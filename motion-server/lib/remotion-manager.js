/**
 * Remotion Manager — writes TSX compositions and manages Root.tsx registry.
 * TSX sanitization delegated to tsx-sanitizer.js
 * TSX validation delegated to tsx-validator.js
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const TsxSanitizer = require('./tsx-sanitizer');
const TsxValidator = require('./tsx-validator');

class RemotionManager {
  constructor(renderProjectPath) {
    this.projectPath = renderProjectPath;
    this.compositionsDir = path.join(renderProjectPath, 'src', 'compositions');
    this.rootTsxPath = path.join(renderProjectPath, 'src', 'Root.tsx');
    this.outputDir = path.join(renderProjectPath, 'out');
    this.sanitizer = new TsxSanitizer(renderProjectPath);
    this.validator = new TsxValidator();

    if (!fs.existsSync(this.compositionsDir)) {
      fs.mkdirSync(this.compositionsDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  writeComposition(compositionId, tsxCode, durationFrames) {
    // Sanitize: strip unsafe/broken patterns
    tsxCode = this.sanitizer.sanitize(tsxCode);

    // Validate imports against known packages
    const validationResult = this.validator.validateImports(tsxCode);
    if (validationResult.fixedCode) {
      tsxCode = validationResult.fixedCode;
    }

    // Syntax pre-check
    const syntaxResult = this.validator.validateSyntax(tsxCode);
    if (!syntaxResult.valid) {
      console.error(`[RemotionManager] Syntax errors in ${compositionId}:`, syntaxResult.errors);
      tsxCode = this.validator.autoFixSyntax(tsxCode);
      const recheck = this.validator.validateSyntax(tsxCode);
      if (!recheck.valid) {
        console.error(`[RemotionManager] Could not auto-fix ${compositionId}, skipping registration`);
        const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
        fs.writeFileSync(filePath, tsxCode, 'utf8');
        return { filePath, syntaxError: true, errors: recheck.errors };
      }
    }

    const filePath = path.join(this.compositionsDir, `${compositionId}.tsx`);
    fs.writeFileSync(filePath, tsxCode, 'utf8');

    const totalFrames = this._calculateDuration(tsxCode, durationFrames);

    // Save duration metadata
    const metaPath = path.join(this.compositionsDir, `${compositionId}.duration`);
    fs.writeFileSync(metaPath, String(totalFrames), 'utf8');

    this._registerInRoot(compositionId, totalFrames);
    console.log(`[RemotionManager] Wrote ${compositionId} (${totalFrames} frames) → ${filePath}`);
    return { filePath, durationFrames: totalFrames };
  }

  _calculateDuration(tsxCode, fallback) {
    let maxEnd = 0;
    const reSeq = /<Sequence[\s\S]*?from=\{(\d+)\}[\s\S]*?durationInFrames=\{(\d+)\}/g;
    let m;
    while ((m = reSeq.exec(tsxCode)) !== null) {
      const end = parseInt(m[1], 10) + parseInt(m[2], 10);
      if (end > maxEnd) maxEnd = end;
    }

    if (maxEnd === 0 && tsxCode.indexOf('TransitionSeries') !== -1) {
      const allDurs = tsxCode.match(/durationInFrames=\{(\d+)\}/g) || [];
      let sum = 0;
      allDurs.forEach(d => {
        const val = d.match(/(\d+)/);
        if (val) sum += parseInt(val[1]);
      });
      if (sum > 0) maxEnd = sum;
    }

    const calculated = maxEnd > 0 ? maxEnd + 6 : 0;
    return Math.max(calculated, fallback || 300);
  }

  updateCompositionDuration(compositionId, durationFrames) {
    if (!fs.existsSync(this.rootTsxPath)) return;
    let root = fs.readFileSync(this.rootTsxPath, 'utf8');

    const escapedId = compositionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(<Composition\\s+id="${escapedId}"[^>]*durationInFrames=\\{)\\d+(\\})`
    );
    if (regex.test(root)) {
      root = root.replace(regex, '$1' + durationFrames + '$2');
      fs.writeFileSync(this.rootTsxPath, root, 'utf8');
      console.log(`[RemotionManager] Updated ${compositionId} duration to ${durationFrames} frames`);
    } else {
      console.warn(`[RemotionManager] Could not find ${compositionId} in Root.tsx to update duration`);
    }

    const metaPath = path.join(this.compositionsDir, `${compositionId}.duration`);
    fs.writeFileSync(metaPath, String(durationFrames), 'utf8');
  }

  _registerInRoot(compositionId, durationFrames) {
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

  _deregisterFromRoot(compositionId) {
    if (!fs.existsSync(this.rootTsxPath)) return;
    let root = fs.readFileSync(this.rootTsxPath, 'utf8');

    const componentName = this._componentName(compositionId);
    const importRe = new RegExp(`^import\\s*\\{\\s*${componentName}\\s*\\}.*\\n?`, 'm');
    root = root.replace(importRe, '');
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
    if (/^\d/.test(name)) name = 'M' + name;
    return name;
  }

  syncFromSession(sessionDir) {
    if (!sessionDir || !fs.existsSync(sessionDir)) return;

    if (fs.existsSync(this.compositionsDir)) {
      const files = fs.readdirSync(this.compositionsDir).filter(f => f.endsWith('.tsx'));
      files.forEach(f => fs.unlinkSync(path.join(this.compositionsDir, f)));
    }

    const sessionSrc = path.join(sessionDir, 'src');
    const sessionCompsLegacy = path.join(sessionDir, 'compositions');
    const srcFolder = fs.existsSync(sessionSrc) ? sessionSrc : fs.existsSync(sessionCompsLegacy) ? sessionCompsLegacy : null;
    if (srcFolder) {
      const files = fs.readdirSync(srcFolder).filter(f => f.endsWith('.tsx'));
      files.forEach(f => {
        const content = fs.readFileSync(path.join(srcFolder, f), 'utf8');
        const syntaxCheck = this.validator.validateSyntax(content);
        if (!syntaxCheck.valid) {
          console.warn(`[RemotionManager] Skipping broken session file ${f}:`, syntaxCheck.errors);
          try {
            const brokenDir = path.join(srcFolder, '.broken');
            if (!fs.existsSync(brokenDir)) fs.mkdirSync(brokenDir, { recursive: true });
            fs.renameSync(path.join(srcFolder, f), path.join(brokenDir, f));
            console.warn(`[RemotionManager] Moved ${f} to .broken/`);
          } catch(_e) {}
          return;
        }
        const destPath = path.join(this.compositionsDir, f);
        let patchedContent = this.sanitizer.injectStaticPreview(content);
        fs.writeFileSync(destPath, patchedContent, 'utf8');
        const durationFile = f.replace('.tsx', '.duration');
        const durationPath = path.join(srcFolder, durationFile);
        if (fs.existsSync(durationPath)) {
          fs.copyFileSync(durationPath, path.join(this.compositionsDir, durationFile));
        }
      });
    }

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
    const metaSrc = path.join(this.compositionsDir, `${compositionId}.duration`);
    if (fs.existsSync(metaSrc)) {
      fs.copyFileSync(metaSrc, path.join(srcDir, `${compositionId}.duration`));
    }
  }

  _rebuildRoot() {
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

    const files = fs.readdirSync(this.compositionsDir).filter(f => f.endsWith('.tsx'));
    files.forEach(f => {
      const id = f.replace('.tsx', '');
      const content = fs.readFileSync(path.join(this.compositionsDir, f), 'utf8');

      const syntaxCheck = this.validator.validateSyntax(content);
      if (!syntaxCheck.valid) {
        console.warn(`[RemotionManager] Skipping ${id} during rebuild — syntax errors:`, syntaxCheck.errors);
        return;
      }

      const metaPath = path.join(this.compositionsDir, `${id}.duration`);
      let totalFrames = 300;
      if (fs.existsSync(metaPath)) {
        const saved = parseInt(fs.readFileSync(metaPath, 'utf8').trim(), 10);
        if (saved > 0) totalFrames = saved;
      } else {
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
    const rendersDir = customOutputDir ? path.join(sessionDir, 'renders') : sessionDir;
    if (!fs.existsSync(rendersDir)) {
      fs.mkdirSync(rendersDir, { recursive: true });
    }
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
        const buildErrorMatch = errorMsg.match(/compositions\/([^:]+\.tsx):\d+:\d+: ERROR:/);
        if (buildErrorMatch) {
          const brokenFile = buildErrorMatch[1].replace('.tsx', '');
          console.error(`[RemotionManager] Build error in ${brokenFile}, deregistering from Root.tsx`);
          this._deregisterFromRoot(brokenFile);
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
