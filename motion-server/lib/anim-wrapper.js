/**
 * Animation Wrapper — injects reliable Anim and Section components into LLM-generated layouts.
 *
 * The LLM generates static layouts using:
 *   <Anim type="fade-up" delay={0}>content</Anim>
 *   <Section from={0} dur={150}>layout</Section>
 *
 * This module replaces the `declare const Anim` and `declare const Section` stubs
 * with actual Remotion implementations.
 */

const ANIM_COMPONENT = `
// ─── Animation Engine (auto-injected, do not modify) ───────────────────────
const Anim:React.FC<{type?:string;delay?:number;children:React.ReactNode;style?:React.CSSProperties}> = ({type='fade-up',delay=0,children,style}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const p = interpolate(f, [0, 18], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  let transform = '';
  switch(type) {
    case 'fade-up':    transform = \`translateY(\${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-down':  transform = \`translateY(\${interpolate(p,[0,1],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-left':  transform = \`translateX(\${interpolate(p,[0,1],[80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-right': transform = \`translateX(\${interpolate(p,[0,1],[-80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'pop':        transform = \`scale(\${interpolate(p,[0,1],[0.7,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})\`; break;
    case 'fade':       transform = ''; break;
    default:           transform = \`translateY(\${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
  }
  return <div style={{opacity:p, transform: transform || undefined, ...style}}>{children}</div>;
};
`;

const SECTION_COMPONENT = `
// ─── Section Engine (auto-injected, do not modify) ─────────────────────────
const Section:React.FC<{from:number;dur:number;children:React.ReactNode}> = ({from,dur,children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: totalDur} = useVideoConfig();
  const localFrame = frame - from;
  if (localFrame < -10 || localFrame >= dur) return null;
  const fi = 10;
  const fo = 10;
  const fadeIn = interpolate(localFrame, [0, fi], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeOut = interpolate(localFrame, [endStart, dur], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const opacity = Math.min(fadeIn, fadeOut);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};
`;

/**
 * Inject Anim and Section implementations into LLM-generated TSX code.
 * Replaces the `declare const` stubs and ensures necessary imports are present.
 */
function injectAnimWrapper(tsxCode) {
  let code = tsxCode;

  // ── 1. Remove declare stubs (entire lines, including multi-line type declarations) ──
  // These match: declare const Anim: React.FC<{...}>; (possibly spanning the whole line)
  code = code.replace(/^declare\s+const\s+Anim\b[^\n]*\n?/gm, '');
  code = code.replace(/^declare\s+const\s+Section\b[^\n]*\n?/gm, '');

  // ── 2. Ensure required imports from 'remotion' ─────────────────────────────
  const neededImports = ['useCurrentFrame', 'useVideoConfig', 'interpolate', 'Easing'];
  const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]remotion['"]/);
  if (importMatch) {
    const currentImports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const missing = neededImports.filter(i => !currentImports.includes(i));
    if (missing.length > 0) {
      const newImports = [...currentImports, ...missing].join(', ');
      code = code.replace(importMatch[0], `import {${newImports}} from 'remotion'`);
    }
  } else {
    // No remotion import found — add one after the last import line
    const lastImportIdx = code.lastIndexOf('import ');
    if (lastImportIdx !== -1) {
      const endOfLine = code.indexOf('\n', lastImportIdx);
      code = code.slice(0, endOfLine + 1)
        + `import {${neededImports.join(', ')}} from 'remotion';\n`
        + code.slice(endOfLine + 1);
    }
  }

  // ── 3. Find insertion point — right before the first user layout const or export ──
  let insertIdx = -1;

  // Try: before any "// ═══" marker
  const markerIdx = code.indexOf('// ═══');
  if (markerIdx !== -1) insertIdx = markerIdx;

  // Try: before "const Layout" or any user-defined component
  if (insertIdx === -1) {
    const layoutMatch = code.match(/^const Layout\d*/m);
    if (layoutMatch) insertIdx = code.indexOf(layoutMatch[0]);
  }

  // Try: before "export const"
  if (insertIdx === -1) {
    const exportIdx = code.indexOf('export const');
    if (exportIdx !== -1) insertIdx = exportIdx;
  }

  // ── 4. Insert Anim and Section implementations ─────────────────────────────
  if (insertIdx !== -1) {
    code = code.slice(0, insertIdx) + ANIM_COMPONENT + '\n' + SECTION_COMPONENT + '\n' + code.slice(insertIdx);
  } else {
    // Append before last line as fallback
    const lastNewline = code.lastIndexOf('\n');
    code = code.slice(0, lastNewline) + '\n' + ANIM_COMPONENT + '\n' + SECTION_COMPONENT + '\n' + code.slice(lastNewline);
  }

  return code;
}

module.exports = { injectAnimWrapper, ANIM_COMPONENT, SECTION_COMPONENT };
