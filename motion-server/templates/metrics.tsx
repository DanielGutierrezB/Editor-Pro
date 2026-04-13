// ============================================================
// TEMPLATE: METRICS
// Description: 2-4 KPI metrics dashboard with counters
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
        backgroundColor: C.card, borderRadius: 16, padding: "36px 36px 44px 36px", minHeight: 220,
        border: active ? `1px solid ${accent}30` : `1px solid ${C.border}`,
        boxShadow: shadows[active ? Math.max(elevation, 3) : elevation],
        position: 'relative', overflow: 'visible',
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
  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0,width:'100%'}}>
    <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:4}}>
        <OdometerDigit value={value} d={d} fontSize={64} color={accent}/>
        <E d={d+15} from="pop"><span style={{fontSize:32,fontWeight:700,color:accent}}>{suffix}</span></E>
      </div>
    </div>
    <E d={d+20} from="up"><span style={{fontSize:18,fontWeight:500,color:C.dim,marginTop:12}}>{label}</span></E>
  </div>
);

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
const TITLE = "Resultados del Q4";
const METRICS = [
  { value: 73, suffix: "%", label: "Conversión", icon: "TrendingUp", accent: "accent" },
  { value: 2400, suffix: "+", label: "Usuarios activos", icon: "Users", accent: "orange" },
  { value: 99, suffix: "%", label: "Satisfacción", icon: "Heart", accent: "purple" },
];

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const {durationInFrames: dur} = useVideoConfig();

  return (
    <Fd dur={dur} fo={1}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:48, textAlign:'center'}}>
          <div style={{fontSize:42, fontWeight:700, color:C.text}}>{TITLE}</div>
          <AccentSeparator d={8} width={60} variant="line"/>
        </E>
        <div style={{display:'flex', gap:60, justifyContent:'center', alignItems:'stretch', flexWrap:'wrap'}}>
          {METRICS.map((m, i) => {
            const accentColor = (C as any)[m.accent] || C.accent;
            const delay = 12 + i * 8;
            return (
              <GlowCard key={i} d={delay} accent={accentColor} elevation={i === 0 ? 4 : 2}
                width={Math.min(340, Math.floor(1500 / METRICS.length))} active={i === 0}>
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:0, flex:1, justifyContent:'center', width:'100%'}}>
                  <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:8}}>
                    <Icon name={m.icon} size={36} color={accentColor}/>
                  </div>
                  <AnimatedMetric value={m.value} suffix={m.suffix} label={m.label}
                    d={delay + 10} accent={accentColor}/>
                </div>
              </GlowCard>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};

export const MyComposition:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
