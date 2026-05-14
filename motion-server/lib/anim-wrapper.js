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
  // Visible when localFrame is within [0, dur)
  if (localFrame < -10 || localFrame >= dur) return null;
  // Fade in over 10 frames, fade out over 10 frames
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

  // Remove declare stubs
  code = code.replace(/declare const Anim:.*?;\n?/g, '');
  code = code.replace(/declare const Section:.*?;\n?/g, '');

  // Ensure useCurrentFrame, useVideoConfig, interpolate, Easing are imported
  const neededImports = ['useCurrentFrame', 'useVideoConfig', 'interpolate', 'Easing'];
  neededImports.forEach(imp => {
    if (!code.includes(imp)) {
      // Add to the remotion import line
      code = code.replace(
        /from\s+'remotion'\s*;/,
        (match) => {
          // Insert before the closing
          return match.replace("from 'remotion';", `${imp}, ` + "} from 'remotion';").replace('{', '').replace(/,\s*\}/, '}');
        }
      );
    }
  });

  // More robust: just ensure the import line has what we need
  const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*'remotion'/);
  if (importMatch) {
    const currentImports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    const missing = neededImports.filter(i => !currentImports.includes(i));
    if (missing.length > 0) {
      const newImports = [...currentImports, ...missing].join(', ');
      code = code.replace(importMatch[0], `import {${newImports}} from 'remotion'`);
    }
  }

  // Find insertion point — after the C palette definition and Safe component
  const safeEnd = code.indexOf('</div>\n);');
  let insertIdx = -1;

  // Try to insert after Safe component
  const safePattern = /const Safe:React\.FC.*?\n\);/s;
  const safeMatch = code.match(safePattern);
  if (safeMatch) {
    insertIdx = code.indexOf(safeMatch[0]) + safeMatch[0].length;
  }

  if (insertIdx === -1) {
    // Fallback: insert before the first const that isn't C or Safe
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('// ═══') || lines[i].includes('YOUR LAYOUT')) {
        insertIdx = code.indexOf(lines[i]);
        break;
      }
    }
  }

  if (insertIdx === -1) {
    // Last resort: insert before export
    const exportIdx = code.indexOf('export const');
    if (exportIdx !== -1) insertIdx = exportIdx;
  }

  if (insertIdx !== -1) {
    code = code.slice(0, insertIdx) + '\n' + ANIM_COMPONENT + '\n' + SECTION_COMPONENT + '\n' + code.slice(insertIdx);
  } else {
    // Really last resort — prepend after imports
    code = code + '\n' + ANIM_COMPONENT + '\n' + SECTION_COMPONENT;
  }

  return code;
}

module.exports = { injectAnimWrapper, ANIM_COMPONENT, SECTION_COMPONENT };
