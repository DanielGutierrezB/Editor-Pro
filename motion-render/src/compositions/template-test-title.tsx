import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Zap } from 'lucide-react';

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

const AnimatedText:React.FC<{
  text:string; d:number; fontSize?:number; fontWeight?:number;
  color?:string; align?:'left'|'center'|'right'; mode?:'word'|'fade'; framesPerWord?:number;
}> = ({text, d, fontSize=36, fontWeight=700, color=C.text, align='center', mode='word', framesPerWord=4}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  if (mode === 'fade') {
    const progress = interpolate(frame - d, [0, 25], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    return <div style={{fontSize, fontWeight, color, textAlign:align, opacity:progress, transform:`translateY(${interpolate(progress,[0,1],[30,0])}px)`}}>{text}</div>;
  }
  return (
    <div style={{fontSize, fontWeight, textAlign:align, display:'flex', flexWrap:'wrap',
      justifyContent: align === 'center' ? 'center' : 'flex-start', gap: `0 ${fontSize * 0.3}px`}}>
      {words.map((word, i) => {
        const wd = d + i * framesPerWord;
        const p = interpolate(frame - wd, [0, 12], [0, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        return <span key={i} style={{color, opacity: p, transform:`translateY(${interpolate(p,[0,1],[20,0])}px)`, display:'inline-block'}}>{word}</span>;
      })}
    </div>
  );
};

const AccentSeparator:React.FC<{d:number;width?:number;color?:string;variant?:'line'|'gradient'}> = ({d, width=80, color=C.accent, variant='gradient'}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - d, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  if (variant === 'gradient') {
    return <div style={{width: width * progress, height: 2, margin: '0 auto',
      background: `linear-gradient(90deg, transparent, ${color}, transparent)`, borderRadius: 1}}/>;
  }
  return <div style={{width: width * progress, height: 2, backgroundColor: color, borderRadius: 1, margin: '0 auto'}}/>;
};

// CONTENT
const TITLE = "Meta Ads Avanzado";
const SUBTITLE = "Domina el algoritmo y escala tus campañas";
const ACCENT_KEY = "accent";

const Section1:React.FC = () => {
  const {durationInFrames: dur} = useVideoConfig();
  const accentColor = (C as any)[ACCENT_KEY] || C.accent;
  return (
    <Fd dur={dur} fo={1}>
      <div style={{position:'absolute', inset:0, zIndex:-1,
        background:`radial-gradient(ellipse at 50% 45%, ${accentColor}08, transparent 65%)`}}/>
      <Safe style={{justifyContent:'center', alignItems:'center', gap:0}}>
        <E d={0} from="pop">
          <div style={{width:140, height:140, borderRadius:70, background:C.card,
            border:`1px solid ${accentColor}30`,
            boxShadow:`0 0 40px ${accentColor}10, 0 8px 32px rgba(0,0,0,0.3)`,
            display:'flex', alignItems:'center', justifyContent:'center', marginBottom:40}}>
            <Zap size={64} color={accentColor} strokeWidth={1.5}/>
          </div>
        </E>
        <AnimatedText text={TITLE} d={10} fontSize={60} fontWeight={700} color={C.text} mode="word" framesPerWord={4}/>
        <div style={{height:24}}/>
        <AccentSeparator d={10 + TITLE.split(' ').length * 4 + 10} width={80} color={accentColor} variant="gradient"/>
        <div style={{height:24}}/>
        <AnimatedText text={SUBTITLE} d={10 + TITLE.split(' ').length * 4 + 25} fontSize={26} fontWeight={400} color={C.dim} mode="fade"/>
      </Safe>
    </Fd>
  );
};

export const TemplateTestTitle:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={180} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
