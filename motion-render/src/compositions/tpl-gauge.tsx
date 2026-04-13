// ============================================================
// TEMPLATE: GAUGE
// Description: Single large metric vs target with progress bar
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
const OdometerDigit:React.FC<{value:number;d:number;fontSize?:number;color?:string}> = ({value,d,fontSize=96,color=C.accent}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - d, [0, 40], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const current = Math.round(interpolate(progress, [0,1], [0, value]));
  const digits = String(current).split('');
  return (
    <div style={{display:'flex',overflow:'hidden',height:fontSize*1.2}}>
      {digits.map((digit, i) => {
        const dp = interpolate(frame - d - i*3, [0,30], [0,1], {
          easing: Easing.bezier(0.16,1,0.3,1), extrapolateLeft:'clamp', extrapolateRight:'clamp',
        });
        return <div key={i} style={{fontSize,fontWeight:700,color,fontFamily:"'DM Sans',sans-serif",lineHeight:1.2,opacity:dp,
          transform:`translateY(${interpolate(dp,[0,1],[fontSize*0.5,0])}px)`}}>{digit}</div>;
      })}
    </div>
  );
};

const AnimatedMetric:React.FC<{value:number;suffix:string;label:string;d:number;accent?:string}> = ({value,suffix,label,d,accent=C.accent}) => (
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
    <div style={{display:'flex',alignItems:'baseline',gap:4}}>
      <OdometerDigit value={value} d={d} fontSize={96} color={accent}/>
      <E d={d+15} from="pop"><span style={{fontSize:48,fontWeight:700,color:accent}}>{suffix}</span></E>
    </div>
    <E d={d+20} from="up"><span style={{fontSize:22,fontWeight:400,color:C.dim,textTransform:'uppercase',letterSpacing:3}}>{label}</span></E>
  </div>
);

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const VALUE = 73;
const TARGET = 80;
const SUFFIX = "%";
const LABEL = "Tasa de Conversión";
const SUBLABEL = "Meta: 80%";

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames: dur} = useVideoConfig();
  const barColor = VALUE >= TARGET ? C.accent : VALUE >= TARGET * 0.7 ? C.orange : C.red;

  const progress = spring({frame: frame - 10, fps, config: {damping: 20, mass: 0.5}});
  const barWidth = interpolate(progress, [0, 1], [0, (VALUE / Math.max(TARGET * 1.2, VALUE * 1.1)) * 100], {
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const targetPos = (TARGET / Math.max(TARGET * 1.2, VALUE * 1.1)) * 100;

  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center', alignItems:'center'}}>
        <AnimatedMetric value={VALUE} suffix={SUFFIX} label={LABEL} d={0} accent={barColor}/>
        <div style={{height:48}}/>
        <E d={25} from="up" style={{width:'100%', maxWidth:700}}>
          <div style={{position:'relative'}}>
            <div style={{height:16, backgroundColor:C.card, borderRadius:8, overflow:'hidden', width:'100%'}}>
              <div style={{
                height:'100%', width:`${barWidth}%`, backgroundColor:barColor,
                borderRadius:8, boxShadow:`0 0 20px ${barColor}30`,
              }}/>
            </div>
            <div style={{
              position:'absolute', top:-8, left:`${targetPos}%`, width:2, height:32,
              backgroundColor:C.dim, opacity:0.6,
            }}/>
            <E d={35} from="up" style={{position:'absolute', top:28, left:`${targetPos}%`, transform:'translateX(-50%)'}}>
              <div style={{fontSize:18, fontWeight:400, color:C.dim}}>
                {SUBLABEL}
              </div>
            </E>
          </div>
        </E>
      </Safe>
    </Fd>
  );
};

export const Tplgauge:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
