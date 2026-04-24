#!/usr/bin/env node
/**
 * Adds staticPreview support to all motion templates.
 * When remotion still is called with --props='{"staticPreview":true}',
 * all animation components (E, Fd, AnimatedText, AccentSeparator) render at full opacity without animation.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'motion-server', 'templates');

const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.tsx'));

let modified = 0;

for (const file of files) {
  const filePath = path.join(TEMPLATES_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Add getInputProps to remotion import if not present
  if (!content.includes('getInputProps')) {
    content = content.replace(
      /from 'remotion';/,
      (match) => {
        // Insert getInputProps before the closing
        return match.replace("from 'remotion'", "getInputProps, from 'remotion'");
      }
    );
    // Actually, better approach: add it to the import list
    content = content.replace(
      /import \{([^}]+)\} from 'remotion';/,
      (match, imports) => {
        if (imports.includes('getInputProps')) return match;
        return `import {${imports}, getInputProps} from 'remotion';`;
      }
    );
    changed = true;
  }

  // 2. Add _static constant after imports (before const C =)
  if (!content.includes('const _static')) {
    content = content.replace(
      /^const C = \{/m,
      'const _static = (getInputProps() as any).staticPreview === true;\n\nconst C = {'
    );
    changed = true;
  }

  // 3. Replace E component to support static mode
  const oldE = `const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, 30], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });`;
  
  const newE = `const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const progress = interpolate(frame-d, [0, 30], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });`;

  if (content.includes(oldE)) {
    content = content.replace(oldE, newE);
    changed = true;
  }

  // 4. Replace Fd component to support static mode
  const oldFd = `const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();`;
  
  const newFd = `const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;`;

  if (content.includes(oldFd)) {
    content = content.replace(oldFd, newFd);
    changed = true;
  }

  // 5. Replace AnimatedText if present
  if (content.includes('const AnimatedText:')) {
    // Add static check after the first line of AnimatedText
    const oldAT = `const frame = useCurrentFrame();
  const words = text.split(' ');`;
    const newAT = `const frame = useCurrentFrame();
  const words = text.split(' ');
  if (_static) return <div style={{fontSize, fontWeight, color, textAlign:align}}>{text}</div>;`;
    
    if (content.includes(oldAT) && !content.includes('if (_static) return <div style={{fontSize, fontWeight, color, textAlign:align}}>{text}</div>')) {
      content = content.replace(oldAT, newAT);
      changed = true;
    }
  }

  // 6. Replace AccentSeparator if present
  if (content.includes('const AccentSeparator:')) {
    const oldAS = `const progress = interpolate(frame - d, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (variant === 'gradient')`;
    const newAS = `if (_static) {
    if (variant === 'gradient') return <div style={{width, height:2, margin:'0 auto', background:\`linear-gradient(90deg, transparent, \${color}, transparent)\`, borderRadius:1}}/>;
    return <div style={{width, height:2, backgroundColor:color, borderRadius:1, margin:'0 auto'}}/>;
  }
  const progress = interpolate(frame - d, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (variant === 'gradient')`;
    
    if (content.includes(oldAS)) {
      content = content.replace(oldAS, newAS);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    modified++;
    console.log(`✅ ${file}`);
  } else {
    console.log(`⏭ ${file} (no changes needed)`);
  }
}

console.log(`\nDone: ${modified}/${files.length} templates modified.`);
