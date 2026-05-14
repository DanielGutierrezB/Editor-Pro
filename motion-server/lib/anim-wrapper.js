/**
 * Animation Wrapper v2 — injects Anim and Section components into LLM-generated layouts.
 *
 * Key fix: Section now uses Remotion's <Sequence> which properly resets
 * useCurrentFrame() to local time. This means Anim delays work correctly
 * in ALL sections, not just the first one.
 *
 * v1 bug: Anim used global frame, so delay=0 in Section 2 (from=148)
 * would calculate frame-0 = 148, making the animation instant (already done).
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

// Section now uses Remotion's Sequence which resets useCurrentFrame() to local time.
// This ensures Anim delays work correctly in every section.
// Fade in/out is handled by a wrapper div with opacity interpolation.
const SECTION_COMPONENT = `
// ─── Section Engine (auto-injected, do not modify) ─────────────────────────
const SectionFade:React.FC<{dur:number;children:React.ReactNode}> = ({dur,children}) => {
  const frame = useCurrentFrame();
  const fi = 12;
  const fo = 12;
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeIn = interpolate(frame, [0, fi], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const fadeOut = interpolate(frame, [endStart, dur], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
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
 * Replaces the `declare const` stubs and ensures necessary imports are present.
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
