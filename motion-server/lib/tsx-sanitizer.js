/**
 * tsx-sanitizer.js — Sanitizes AI-generated TSX code before writing to disk.
 * Handles: brandfetch stripping, Trail removal, TransitionSeries removal,
 * staticPreview injection, and brand icon replacement.
 */
const fs = require('fs');
const path = require('path');

class TsxSanitizer {
  constructor(renderProjectPath) {
    this.projectPath = renderProjectPath;
  }

  /**
   * Run all sanitization passes on TSX code.
   * Returns the cleaned TSX string.
   */
  sanitize(tsxCode) {
    tsxCode = this.stripBrandfetch(tsxCode);
    tsxCode = this.stripTrail(tsxCode);
    tsxCode = this.stripFadeTransitions(tsxCode);
    tsxCode = this.injectStaticPreview(tsxCode);
    tsxCode = this.replaceBrandIcons(tsxCode);
    return tsxCode;
  }

  stripBrandfetch(tsxCode) {
    if (!/brandfetch/i.test(tsxCode)) return tsxCode;

    console.log('[TsxSanitizer] Stripping brandfetch references from TSX');

    tsxCode = tsxCode.replace(/<Img\s+[^>]*(?:src=\{?["'][^"']*brandfetch[^"']*["']\}?)[^>]*\/?>/gi,
      '<Globe size={60} color={C.accent} />');

    tsxCode = tsxCode.replace(/.*https?:\/\/[^\s]*brandfetch[^\s]*.*$/gm, '// [REMOVED: brandfetch URL not available]');

    if (tsxCode.includes('<Globe') && !/import\s*\{[^}]*Globe[^}]*\}\s*from\s*['"]lucide-react['"]/.test(tsxCode)) {
      const lucideImportMatch = tsxCode.match(/^(import\s*\{)([^}]*)\}\s*from\s*['"]lucide-react['"]/m);
      if (lucideImportMatch) {
        const existingImports = lucideImportMatch[2].trim();
        tsxCode = tsxCode.replace(lucideImportMatch[0],
          `import { ${existingImports}, Globe } from 'lucide-react'`);
      } else {
        tsxCode = tsxCode.replace(/(^import\s+.*$(?![\s\S]*^import\s))/m,
          "$1\nimport { Globe } from 'lucide-react';");
      }
    }

    return tsxCode;
  }

  /**
   * Strip @remotion/motion-blur Trail component — AI frequently omits required
   * trailOpacity prop causing render crashes.
   */
  stripTrail(tsxCode) {
    if (!/Trail/i.test(tsxCode) || !/@remotion\/motion-blur/.test(tsxCode)) return tsxCode;
    
    console.log('[TsxSanitizer] Stripping Trail from TSX (crash prevention)');
    
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*Trail[^}]*\}\s*from\s*['"]@remotion\/motion-blur['"];?\s*$/gm, '// REMOVED: @remotion/motion-blur (crash prevention)');
    tsxCode = tsxCode.replace(/<Trail\b[^>]*>/g, '<div>');
    tsxCode = tsxCode.replace(/<\/Trail>/g, '</div>');
    
    return tsxCode;
  }

  /**
   * Strip TransitionSeries + fade() usage. Replace with plain <Sequence> blocks.
   */
  stripFadeTransitions(tsxCode) {
    if (!/TransitionSeries/.test(tsxCode)) return tsxCode;
    
    console.log('[TsxSanitizer] Stripping TransitionSeries/fade from TSX');
    
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*fade[^}]*\}\s*from\s*['"]@remotion\/transitions\/fade['"];?\s*$/gm, 
      '// REMOVED: fade transition (hard cuts enforced)');
    
    tsxCode = tsxCode.replace(/<TransitionSeries\.Sequence\b/g, '<Sequence');
    tsxCode = tsxCode.replace(/<\/TransitionSeries\.Sequence>/g, '</Sequence>');
    tsxCode = tsxCode.replace(/<TransitionSeries\.Transition[\s\S]*?\/>/g, '');
    tsxCode = tsxCode.replace(/<TransitionSeries\b[^>]*>/g, '<>');
    tsxCode = tsxCode.replace(/<\/TransitionSeries>/g, '</>');
    tsxCode = tsxCode.replace(/^import\s*\{[^}]*TransitionSeries[^}]*\}\s*from\s*['"]@remotion\/transitions['"];?\s*$/gm,
      '// REMOVED: TransitionSeries (hard cuts enforced)');
    
    return tsxCode;
  }

  /**
   * Inject staticPreview support into AI-generated compositions so stills
   * render with all elements at full opacity (no mid-animation frames).
   */
  injectStaticPreview(tsxCode) {
    if (/\b_static\b/.test(tsxCode) && /getInputProps/.test(tsxCode)) return tsxCode;

    console.log('[TsxSanitizer] Injecting staticPreview support');

    // Add getInputProps to the remotion import
    const remotionImportRe = /(import\s*\{)([^}]*)(}\s*from\s*['"]remotion['"])/;
    const remotionMatch = tsxCode.match(remotionImportRe);
    if (remotionMatch && !remotionMatch[2].includes('getInputProps')) {
      tsxCode = tsxCode.replace(remotionImportRe, (m, p1, p2, p3) => {
        return p1 + p2.trimEnd() + ', getInputProps' + p3;
      });
    }

    // Add _static variable after all imports
    const lines = tsxCode.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*import\s/.test(lines[i])) lastImportIdx = i;
    }
    if (lastImportIdx >= 0) {
      lines.splice(lastImportIdx + 1, 0, '',
        "const _static = (getInputProps() as any).staticPreview === true;");
      tsxCode = lines.join('\n');
    }

    // Patch E component
    const eCompRe = /(const E:React\.FC<[^>]*>\s*=\s*\(\{[^}]*\}\)\s*=>\s*\{)\s*\n/;
    if (eCompRe.test(tsxCode)) {
      tsxCode = tsxCode.replace(eCompRe, (match, prefix) => {
        return prefix + '\n  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;\n';
      });
    } else {
      const eAltRe = /(const E:React\.FC<[^>]*>\s*=\s*\(\{.*?children.*?\}\)\s*=>\s*\{)/s;
      if (eAltRe.test(tsxCode)) {
        tsxCode = tsxCode.replace(eAltRe, (match, prefix) => {
          return prefix + '\n  if (_static) return <div style={{opacity:1,...(style||{})}}>{children}</div>;';
        });
      } else {
        console.warn('[TsxSanitizer] E component pattern not matched — static preview will not suppress E animations');
      }
    }

    // Patch Fd component
    const fdCompRe = /(const Fd:React\.FC<[^>]*>\s*=\s*\(\{[^}]*\}\)\s*=>\s*\{)\s*\n/;
    if (fdCompRe.test(tsxCode)) {
      tsxCode = tsxCode.replace(fdCompRe, (match, prefix) => {
        return prefix + '\n  if (_static) return <div style={{opacity:1,position:\'absolute\',inset:0}}>{children}</div>;\n';
      });
    } else {
      const fdAltRe = /(const Fd:React\.FC<[^>]*>\s*=\s*\(\{.*?children.*?\}\)\s*=>\s*\{)/s;
      if (fdAltRe.test(tsxCode)) {
        tsxCode = tsxCode.replace(fdAltRe, (match, prefix) => {
          return prefix + '\n  if (_static) return <div style={{opacity:1,position:\'absolute\',inset:0}}>{children}</div>;';
        });
      } else {
        console.warn('[TsxSanitizer] Fd component pattern not matched — static preview will not suppress Fd fade animations');
      }
    }

    return tsxCode;
  }

  /**
   * Replace lucide-react icons used for known brands with local SVG logos.
   */
  replaceBrandIcons(tsxCode) {
    const brandOrder = [
      { brand: 'facebook',  icons: ['Facebook', 'ThumbsUp'], svg: 'facebook.svg' },
      { brand: 'instagram', icons: ['Aperture'], svg: 'instagram.svg' },
      { brand: 'linkedin',  icons: ['Linkedin'], svg: 'linkedin.svg' },
      { brand: 'twitter',   icons: ['Twitter', 'Bird'], svg: 'twitter.svg' },
      { brand: 'github',    icons: ['Github'], svg: 'github.svg' },
      { brand: 'apple',     icons: ['Apple'], svg: 'apple.svg' },
      { brand: 'google',    icons: ['Chrome'], svg: 'google.svg' },
      { brand: 'youtube',   icons: ['PlayCircle'], svg: 'youtube.svg' },
      { brand: 'slack',     icons: ['Hash'], svg: 'slack.svg' },
      { brand: 'amazon',    icons: ['ShoppingCart', 'Package'], svg: 'amazon.svg' },
      { brand: 'meta',      icons: ['Globe', 'Building', 'Layers'], svg: 'meta.svg', requireBrandName: true },
      { brand: 'whatsapp',  icons: ['MessageCircle', 'Phone', 'MessageSquare'], svg: 'whatsapp.svg', requireBrandName: true },
      { brand: 'tiktok',    icons: ['Music', 'Film'], svg: 'tiktok.svg', requireBrandName: true },
      { brand: 'telegram',  icons: ['Send'], svg: 'telegram.svg', requireBrandName: true },
      { brand: 'microsoft', icons: ['Monitor', 'Grid'], svg: 'microsoft.svg', requireBrandName: true },
      { brand: 'netflix',   icons: ['Tv'], svg: 'netflix.svg', requireBrandName: true },
      { brand: 'spotify',   icons: ['Headphones'], svg: 'spotify.svg', requireBrandName: true },
    ];

    let changed = false;
    let logosDir;
    try {
      logosDir = path.join(this.projectPath, 'public', 'logos');
    } catch(_e) { return tsxCode; }
    if (!fs.existsSync(logosDir)) return tsxCode;
    const availableLogos = fs.readdirSync(logosDir).filter(f => f.endsWith('.svg'));
    const replacedIcons = new Set();

    brandOrder.forEach(entry => {
      const regex = new RegExp(entry.brand, 'i');
      if (entry.requireBrandName && !regex.test(tsxCode)) return;
      if (!entry.requireBrandName && !regex.test(tsxCode)) return;
      
      const svgFile = entry.svg;
      if (!availableLogos.includes(svgFile)) return;
      if (tsxCode.includes("staticFile('logos/" + svgFile + "')")) return;
      
      entry.icons.forEach(icon => {
        if (replacedIcons.has(icon)) return;
        const iconRegex = new RegExp('<' + icon + '\\s+[^>]*\\/>', 'g');
        const before = tsxCode;
        tsxCode = tsxCode.replace(iconRegex, 
          `<Img src={staticFile('logos/${svgFile}')} style={{width:60,height:60,objectFit:'contain'}} />`);
        if (tsxCode !== before) {
          console.log(`[TsxSanitizer] Replacing <${icon}/> with ${svgFile} for brand "${entry.brand}"`);
          replacedIcons.add(icon);
          changed = true;
        }
      });
    });

    if (changed) {
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
      console.log('[TsxSanitizer] Brand icons replaced with local SVGs');
    }

    return tsxCode;
  }
}

module.exports = TsxSanitizer;
