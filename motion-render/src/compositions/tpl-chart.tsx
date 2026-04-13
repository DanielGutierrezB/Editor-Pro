// ============================================================
// TEMPLATE: CHART
// Description: Animated bar chart with values
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
const TITLE = "Inversión por Plataforma";
const SUBTITLE = "Distribución del presupuesto Q4 2024";
const BARS = [
  { label: "Meta", value: 45, color: "accent" },
  { label: "Google", value: 32, color: "orange" },
  { label: "TikTok", value: 18, color: "purple" },
  { label: "LinkedIn", value: 12, color: "red" },
];
const VALUE_SUFFIX = "%";

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames: dur} = useVideoConfig();
  const maxValue = Math.max(...BARS.map(d => d.value));
  const maxBarH = 380;
  const barW = Math.min(120, Math.floor(1200 / BARS.length));

  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'space-between', alignItems:'center'}}>
        <div style={{textAlign:'center', marginBottom:40, width:'100%'}}>
          <E d={0} from="up">
            <div style={{fontSize:38, fontWeight:700, color:C.text}}>{TITLE}</div>
          </E>
          {SUBTITLE && (
            <E d={8} from="up">
              <div style={{fontSize:22, color:C.dim, marginTop:8}}>{SUBTITLE}</div>
            </E>
          )}
        </div>
        <div style={{display:'flex', gap:Math.min(40, Math.floor(800 / BARS.length)), alignItems:'flex-end', justifyContent:'center'}}>
          {BARS.map((d, i) => {
            const barColor = (C as any)[d.color] || C.accent;
            const barProgress = spring({
              frame: frame - 25 - i * 8, fps,
              config: {damping: 18, mass: 0.5, stiffness: 80},
            });
            const barH = interpolate(barProgress, [0, 1], [0, (d.value / maxValue) * maxBarH], {
              extrapolateLeft:'clamp', extrapolateRight:'clamp',
            });
            const countValue = Math.round(interpolate(barProgress, [0, 1], [0, d.value], {
              extrapolateLeft:'clamp', extrapolateRight:'clamp',
            }));
            return (
              <div key={i} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
                <div style={{
                  fontSize:24, fontWeight:700, color:barColor,
                  opacity: interpolate(barProgress, [0.3, 0.6], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}),
                }}>
                  {countValue}{VALUE_SUFFIX}
                </div>
                <div style={{
                  width:barW, height:barH, borderRadius:'8px 8px 4px 4px',
                  backgroundColor:barColor, boxShadow:`0 0 20px ${barColor}20`,
                }}/>
                <div style={{
                  fontSize:18, fontWeight:700, color:C.dim, marginTop:4,
                  opacity: interpolate(barProgress, [0, 0.3], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'}),
                }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{width:BARS.length * (barW + 40), maxWidth:'100%', height:2, backgroundColor:C.border}}/>
      </Safe>
    </Fd>
  );
};

export const Tplchart:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
