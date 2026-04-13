// ============================================================
// TEMPLATE: STEPS
// Description: One step at a time with progress dots
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
  dim:'rgba(255,255,255,0.7)', border:'rgba(255,255,255,0.08)',
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
const GlowCard:React.FC<{
  children:React.ReactNode; d:number; from?:string; accent?:string;
  elevation?:1|2|3|4; width?:number|string; active?:boolean; style?:React.CSSProperties;
}> = ({children, d, from='up', accent=C.accent, elevation=2, width='auto', active=true, style}) => {
  const frame = useCurrentFrame();
  const shadows:{[key:number]:string} = {
    1: '0 2px 8px rgba(0,0,0,0.3)',
    2: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
    3: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
    4: `0 8px 32px ${accent}20, 0 0 60px ${accent}08, 0 0 0 1px ${accent}30`,
  };
  const glowIntensity = active
    ? interpolate(frame % 120, [0, 60, 120], [0.03, 0.06, 0.03], {extrapolateRight:'clamp', extrapolateLeft:'clamp'})
    : 0;
  return (
    <E d={d} from={from} style={{width, ...style}}>
      <div style={{
        backgroundColor: C.card, borderRadius: 16, padding: 32,
        border: active ? `1px solid ${accent}30` : `1px solid ${C.border}`,
        boxShadow: shadows[active ? Math.max(elevation, 3) : elevation],
        position: 'relative', overflow: 'hidden',
      }}>
        {active && (<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.6,
        }}/>)}
        {active && (<div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200,
          background: `radial-gradient(circle, ${accent}${Math.round(glowIntensity * 255).toString(16).padStart(2,'0')}, transparent 70%)`,
          pointerEvents: 'none',
        }}/>)}
        <div style={{position:'relative', zIndex:1}}>{children}</div>
      </div>
    </E>
  );
};

const ProgressDots:React.FC<{
  total:number; current:number; d:number; accent?:string; position?:'bottom'|'right';
}> = ({total, current, d, accent=C.accent, position='bottom'}) => {
  const frame = useCurrentFrame();
  const isHorizontal = position === 'bottom';
  return (
    <E d={d} from="pop" style={{
      position: 'absolute',
      ...(isHorizontal
        ? {bottom: 60, left: '50%', transform: 'translateX(-50%)'}
        : {right: 80, top: '50%', transform: 'translateY(-50%)'}
      ),
    }}>
      <div style={{
        display: 'flex', flexDirection: isHorizontal ? 'row' : 'column',
        gap: 12, alignItems: 'center',
      }}>
        {Array.from({length: total}).map((_, i) => {
          const isActive = i === current;
          const isPast = i < current;
          return (
            <div key={i} style={{
              width: isActive ? (isHorizontal ? 36 : 12) : 12,
              height: isActive ? (isHorizontal ? 12 : 36) : 12,
              borderRadius: 6,
              backgroundColor: isActive ? accent : isPast ? `${accent}60` : 'rgba(255,255,255,0.15)',
            }}/>
          );
        })}
      </div>
    </E>
  );
};

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const CLIP_START_TIME = 0; // Will be replaced by template-manager
const STEPS_DATA = [
  { icon: "Search", title: "Investigación", desc: "Analiza tu mercado objetivo y competencia", accent: "accent" },
  { icon: "Target", title: "Segmentación", desc: "Define tu audiencia ideal con datos demográficos", accent: "orange" },
  { icon: "Send", title: "Ejecución", desc: "Lanza tu campaña con métricas de seguimiento", accent: "purple" },
];

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

function stepStartFrame(step: {time?: number}, index: number, totalSteps: number, totalFrames: number): number {
  if (step.time !== undefined && step.time > 0) {
    return Math.round(step.time * 30);
  }
  return Math.floor(index * (totalFrames / totalSteps));
}

const StepSection:React.FC<{stepIndex:number; step:typeof STEPS_DATA[0]}> = ({stepIndex, step}) => {
  const {durationInFrames: dur} = useVideoConfig();
  const accentColor = (C as any)[step.accent] || C.accent;

  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center', alignItems:'center'}}>
        <E d={0} from="pop">
          <div style={{
            fontSize:20, fontWeight:700, color:C.bg,
            backgroundColor:accentColor, borderRadius:20,
            padding:'6px 20px', letterSpacing:2, textTransform:'uppercase', marginBottom:24,
          }}>
            Paso {stepIndex + 1} de {STEPS_DATA.length}
          </div>
        </E>
        <E d={5} from="pop">
          <div style={{
            width:160, height:160, borderRadius:80, background:C.card,
            border:`2px solid ${accentColor}`,
            boxShadow:`0 0 40px ${accentColor}15, 0 16px 48px rgba(0,0,0,0.4)`,
            display:'flex', alignItems:'center', justifyContent:'center', marginBottom:28,
          }}>
            <Icon name={step.icon} size={72} color={accentColor}/>
          </div>
        </E>
        <E d={12} from="up">
          <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', marginBottom:16}}>
            {step.title}
          </div>
        </E>
        <E d={20} from="up">
          <div style={{fontSize:24, fontWeight:400, color:C.dim, textAlign:'center', maxWidth:600}}>
            {step.desc}
          </div>
        </E>
        <ProgressDots total={STEPS_DATA.length} current={stepIndex} d={5} accent={accentColor}/>
      </Safe>
    </Fd>
  );
};

export const MyComposition:React.FC = () => {
  const {durationInFrames} = useVideoConfig();

  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      {STEPS_DATA.map((step, i) => {
        const from = stepStartFrame(step, i, STEPS_DATA.length, durationInFrames);
        const nextFrom = i < STEPS_DATA.length - 1
          ? stepStartFrame(STEPS_DATA[i+1], i+1, STEPS_DATA.length, durationInFrames)
          : durationInFrames;
        return (
          <Sequence key={i} from={from}
            durationInFrames={nextFrom - from}
            premountFor={10}>
            <StepSection stepIndex={i} step={step}/>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
