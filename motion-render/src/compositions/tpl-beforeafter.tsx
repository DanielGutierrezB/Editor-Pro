// ============================================================
// TEMPLATE: BEFOREAFTER
// Description: Split screen before/after with left=wrong, right=correct
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

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const TITLE = "Evolución del Proceso";
const BEFORE = {
  label: "Antes",
  items: ["Proceso manual", "Errores frecuentes", "Días de trabajo"],
};
const AFTER = {
  label: "Después",
  items: ["Automatizado", "Sin errores", "Minutos"],
};

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const {durationInFrames: dur} = useVideoConfig();

  return (
    <Fd dur={dur} fo={1}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:40, textAlign:'center', width:'100%'}}>
          <div style={{fontSize:40, fontWeight:700, color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex', gap:0, justifyContent:'center', alignItems:'stretch', width:'100%'}}>
          <GlowCard d={10} from="left" accent={C.red} elevation={2} active={false} width={'45%'}>
            <div style={{textAlign:'center', marginBottom:20}}>
              <div style={{fontSize:36, marginBottom:8}}>❌</div>
              <div style={{fontSize:28, fontWeight:700, color:C.red}}>{BEFORE.label}</div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              {BEFORE.items.map((item, i) => (
                <E key={i} d={20 + i * 8} from="left">
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:6, height:6, borderRadius:3, backgroundColor:C.red, flexShrink:0}}/>
                    <span style={{fontSize:22, color:C.dim}}>{item}</span>
                  </div>
                </E>
              ))}
            </div>
          </GlowCard>
          <E d={20} from="up" style={{alignSelf:'stretch', margin:'0 24px'}}>
            <div style={{width:2, height:'100%', backgroundColor:C.dim, opacity:0.3}}/>
          </E>
          <GlowCard d={25} from="right" accent={C.accent} elevation={4} active={true} width={'45%'}>
            <div style={{textAlign:'center', marginBottom:20}}>
              <div style={{fontSize:36, marginBottom:8}}>✅</div>
              <div style={{fontSize:28, fontWeight:700, color:C.accent}}>{AFTER.label}</div>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:16}}>
              {AFTER.items.map((item, i) => (
                <E key={i} d={35 + i * 8} from="right">
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:6, height:6, borderRadius:3, backgroundColor:C.accent, flexShrink:0}}/>
                    <span style={{fontSize:22, color:C.text}}>{item}</span>
                  </div>
                </E>
              ))}
            </div>
          </GlowCard>
        </div>
      </Safe>
    </Fd>
  );
};

export const TplBeforeafter:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
