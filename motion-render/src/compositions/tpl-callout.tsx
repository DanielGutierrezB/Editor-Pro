// ============================================================
// TEMPLATE: CALLOUT
// Description: Key phrase / thesis statement, big centered text
// ============================================================
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, Easing} from 'remotion';
import * as LucideIcons from 'lucide-react';

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', green:'#0ae98d',
  orange:'#fb923c', purple:'#a78bfa', red:'#f87171', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(10,233,141,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, 20], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const y = from==='up'?interpolate(progress,[0,1],[80,0]):from==='down'?interpolate(progress,[0,1],[-80,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[80,0]):from==='right'?interpolate(progress,[0,1],[-80,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.85,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:progress,...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  const _fi = Math.max(1, fi);
  const _fo = Math.max(1, fo);
  const _end = Math.max(_fi + 1, dur - _fo);
  return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const Icon:React.FC<{name:string;size?:number;color?:string;strokeWidth?:number}> = ({name,size=60,color=C.accent,strokeWidth=1.5}) => {
  const IconComp = (LucideIcons as any)[name] || LucideIcons.Circle;
  return <IconComp size={size} color={color} strokeWidth={strokeWidth}/>;
};

// --- Advanced Components ---
const AnimatedText:React.FC<{
  text:string; d:number; fontSize?:number; fontWeight?:number; color?:string;
  align?:'left'|'center'|'right'; mode?:'word'|'line'|'fade'; framesPerWord?:number;
}> = ({text, d, fontSize=36, fontWeight=700, color=C.text, align='center', mode='word', framesPerWord=4}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  if (mode === 'fade') {
    const progress = interpolate(frame - d, [0, 25], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    return (
      <div style={{fontSize, fontWeight, color, textAlign:align, opacity:progress,
        transform:`translateY(${interpolate(progress,[0,1],[30,0])}px)`}}>{text}</div>
    );
  }
  return (
    <div style={{fontSize, fontWeight, textAlign:align, display:'flex', flexWrap:'wrap',
      justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      gap: `0 ${fontSize * 0.3}px`}}>
      {words.map((word, i) => {
        const wordDelay = d + i * framesPerWord;
        const progress = interpolate(frame - wordDelay, [0, 12], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        return (
          <span key={i} style={{ color, opacity: progress,
            transform: `translateY(${interpolate(progress, [0,1], [20, 0])}px)`, display: 'inline-block',
          }}>{word}</span>
        );
      })}
    </div>
  );
};

const AccentSeparator:React.FC<{
  d:number; width?:number; color?:string; variant?:'line'|'dots'|'gradient';
}> = ({d, width=80, color=C.accent, variant='line'}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - d, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (variant === 'gradient') {
    return (
      <div style={{ width: width * progress, height: 2, margin: '0 auto',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`, borderRadius: 1,
      }}/>
    );
  }
  return (
    <div style={{ width: width * progress, height: 2,
      backgroundColor: color, borderRadius: 1, margin: '0 auto',
    }}/>
  );
};

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const PHRASE = "El contenido es el rey, pero la distribución es la reina";
const ICON_NAME = "Quote";
const ACCENT_KEY = "accent";

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const {durationInFrames: dur} = useVideoConfig();
  const accentColor = (C as any)[ACCENT_KEY] || C.accent;

  return (
    <Fd dur={dur} fo={1}>
      <div style={{position:'absolute', inset:0, zIndex:-1,
        background:`radial-gradient(circle at 50% 50%, ${accentColor}06, transparent 70%)`}}/>
      <Safe style={{justifyContent:'center', alignItems:'center'}}>
        <E d={0} from="pop">
          <Icon name={ICON_NAME} size={72} color={accentColor}/>
        </E>
        <div style={{height:32}}/>
        <AccentSeparator d={8} width={80} color={accentColor} variant="gradient"/>
        <div style={{height:28}}/>
        <div style={{maxWidth:1200}}>
          <AnimatedText text={PHRASE} d={15} fontSize={48} fontWeight={700} color={C.text} mode="word" framesPerWord={4}/>
        </div>
        <div style={{height:28}}/>
        <AccentSeparator d={15 + PHRASE.split(' ').length * 4 + 10} width={80} color={accentColor} variant="gradient"/>
      </Safe>
    </Fd>
  );
};

export const Tplcallout:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
