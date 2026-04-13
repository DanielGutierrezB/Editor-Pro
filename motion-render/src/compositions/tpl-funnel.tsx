// ============================================================
// TEMPLATE: FUNNEL
// Description: Funnel/pipeline stages narrowing vertically
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

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const TITLE = "Embudo de Ventas";
const STAGES = [
  { icon: "Eye", title: "Awareness", pct: "10,000", accent: "accent" },
  { icon: "MousePointerClick", title: "Interés", pct: "3,200", accent: "orange" },
  { icon: "ShoppingCart", title: "Conversión", pct: "840", accent: "purple" },
  { icon: "Heart", title: "Retención", pct: "520", accent: "green" },
];

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  const framesPerStage = Math.floor((dur - 60) / STAGES.length);

  return (
    <Fd dur={dur} fo={1}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:40, textAlign:'center', width:'100%'}}>
          <div style={{fontSize:38, fontWeight:700, color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12, width:'100%'}}>
          {STAGES.map((stage, i) => {
            const accentColor = (C as any)[stage.accent] || C.accent;
            const stageStart = 20 + i * framesPerStage;
            const isVisible = frame >= stageStart;
            const isActive = i === Math.min(Math.floor((frame - 20) / framesPerStage), STAGES.length - 1);
            const widthPercent = 100 - (i * (50 / Math.max(STAGES.length - 1, 1)));
            if (!isVisible) return null;
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <E d={stageStart - 5} from="up" style={{flexShrink:0}}>
                    <LucideIcons.ChevronDown size={20} color={C.dim} strokeWidth={2}/>
                  </E>
                )}
                <E d={stageStart} from="up" style={{width:`${widthPercent}%`}}>
                  <div style={{
                    display:'flex', alignItems:'center', gap:16, padding:'16px 24px',
                    backgroundColor: isActive ? C.card : 'transparent',
                    borderRadius:12,
                    border: isActive ? `1px solid ${accentColor}30` : `1px solid ${C.border}`,
                    boxShadow: isActive ? `0 8px 32px ${accentColor}15` : 'none',
                    opacity: !isActive && i < Math.floor((frame - 20) / framesPerStage) ? 0.5 : 1,
                  }}>
                    <div style={{
                      width:48, height:48, borderRadius:24, background:`${accentColor}15`,
                      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                    }}>
                      <Icon name={stage.icon} size={24} color={accentColor}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:22, fontWeight:700, color:C.text}}>{stage.title}</div>
                    </div>
                    <div style={{fontSize:24, fontWeight:700, color:accentColor}}>{stage.pct}</div>
                  </div>
                </E>
              </React.Fragment>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};

export const Tplfunnel:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
