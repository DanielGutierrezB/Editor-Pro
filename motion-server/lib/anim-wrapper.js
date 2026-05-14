/**
 * Animation Wrapper v3 — Anim + Section components for LLM-generated layouts.
 *
 * v3 improvements:
 * - Anim: 24-frame entrance (0.8s) with spring-like Bezier for smoother feel
 * - Section: uses Remotion's Sequence for proper local frame context
 * - SectionFade: 15-frame fade in, 15-frame fade out (0.5s each)
 * - Reduced movement distances for subtler, more professional motion
 */

const ANIM_COMPONENT = `
// ─── Animation Engine (auto-injected) ──────────────────────────────────────
const Anim:React.FC<{type?:string;delay?:number;children:React.ReactNode;style?:React.CSSProperties}> = ({type='fade-up',delay=0,children,style}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  // 24 frames = 0.8s entrance with smooth deceleration
  const p = interpolate(f, [0, 24], [0, 1], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  let transform = '';
  switch(type) {
    case 'fade-up':    transform = \`translateY(\${interpolate(p,[0,1],[40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-down':  transform = \`translateY(\${interpolate(p,[0,1],[-40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-left':  transform = \`translateX(\${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'fade-right': transform = \`translateX(\${interpolate(p,[0,1],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
    case 'pop':        transform = \`scale(\${interpolate(p,[0,1],[0.85,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})\`; break;
    case 'fade':       transform = ''; break;
    default:           transform = \`translateY(\${interpolate(p,[0,1],[40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)\`; break;
  }
  return <div style={{opacity:p, transform: transform || undefined, ...style}}>{children}</div>;
};
`;

const SECTION_COMPONENT = `
// ─── Section Engine (auto-injected) ────────────────────────────────────────
const SectionFade:React.FC<{dur:number;children:React.ReactNode}> = ({dur,children}) => {
  const frame = useCurrentFrame();
  // 15 frames (0.5s) fade in, 15 frames fade out — smooth section transitions
  const fi = 15;
  const fo = 15;
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeIn = interpolate(frame, [0, fi], [0, 1], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const fadeOut = interpolate(frame, [endStart, dur], [1, 0], {
    easing: Easing.bezier(0.5, 0, 0.75, 0),
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};

const Section:React.FC<{from:number;dur:number;children:React.ReactNode}> = ({from,dur,children}) => (
  <Sequence from={from} durationInFrames={dur} layout="none">
    <SectionFade dur={dur}>{children}</SectionFade>
  </Sequence>
);
`;

/**
 * Inject Anim and Section implementations into LLM-generated TSX code.
 */
function injectAnimWrapper(tsxCode) {
  let code = tsxCode;

  // ── 1. Remove declare stubs ────────────────────────────────────────────────
  code = code.replace(/^declare\s+const\s+Anim\b[^\n]*\n?/gm, '');
  code = code.replace(/^declare\s+const\s+Section\b[^\n]*\n?/gm, '');

  // ── 2. Ensure required imports from 'remotion' ─────────────────────────────
  const neededImports = ['useCurrentFrame', 'useVideoConfig', 'interpolate', 'Easing', 'Sequence'];
  const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]remotion['"]/);
  if (importMatch) {
    const currentImports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const missing = neededImports.filter(i => !currentImports.includes(i));
    if (missing.length > 0) {
      const newImports = [...currentImports, ...missing].join(', ');
      code = code.replace(importMatch[0], `import {${newImports}} from 'remotion'`);
    }
  } else {
    const lastImportIdx = code.lastIndexOf('import ');
    if (lastImportIdx !== -1) {
      const endOfLine = code.indexOf('\n', lastImportIdx);
      code = code.slice(0, endOfLine + 1)
        + `import {${neededImports.join(', ')}} from 'remotion';\n`
        + code.slice(endOfLine + 1);
    }
  }

  // ── 3. Find insertion point ────────────────────────────────────────────────
  let insertIdx = -1;

  const markerIdx = code.indexOf('// ═══');
  if (markerIdx !== -1) insertIdx = markerIdx;

  if (insertIdx === -1) {
    const layoutMatch = code.match(/^const (Layout|Slide)\d*/m);
    if (layoutMatch) insertIdx = code.indexOf(layoutMatch[0]);
  }

  if (insertIdx === -1) {
    const exportIdx = code.indexOf('export const');
    if (exportIdx !== -1) insertIdx = exportIdx;
  }

  // ── 4. Insert implementations ──────────────────────────────────────────────
  if (insertIdx !== -1) {
    code = code.slice(0, insertIdx) + ANIM_COMPONENT + '\n' + SECTION_COMPONENT + '\n' + code.slice(insertIdx);
  } else {
    const lastNewline = code.lastIndexOf('\n');
    code = code.slice(0, lastNewline) + '\n' + ANIM_COMPONENT + '\n' + SECTION_COMPONENT + '\n' + code.slice(lastNewline);
  }

  return code;
}

module.exports = { injectAnimWrapper, ANIM_COMPONENT, SECTION_COMPONENT };
