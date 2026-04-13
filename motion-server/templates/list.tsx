// ============================================================
// TEMPLATE: LIST
// Description: Animated vertical list with progressive highlight
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
const CascadeItem:React.FC<{d:number;index:number;children:React.ReactNode}> = ({d,index,children}) => {
  const frame = useCurrentFrame();
  const delay = d + index * 8;
  const dist = 60 + index * 15;
  const dur = 22 + index * 2;
  const progress = interpolate(frame - delay, [0, dur], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={{
      opacity: progress,
      transform: `translateY(${interpolate(progress,[0,1],[dist,0])}px)`,
      filter: `blur(${interpolate(progress,[0,0.5,1],[4,1,0])}px)`,
    }}>{children}</div>
  );
};

const AccentSeparator:React.FC<{
  d:number; width?:number; color?:string; variant?:'line'|'dots'|'gradient';
}> = ({d, width=80, color=C.accent, variant='line'}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame - d, [0, 25], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <div style={{ width: width * progress, height: 2,
      backgroundColor: color, borderRadius: 1, margin: '0 auto',
    }}/>
  );
};

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const TITLE = "Checklist de Lanzamiento";
const SUBTITLE = "4 pasos esenciales para tu campaña";
const LIST_ITEMS = [
  "Definir objetivos claros y medibles",
  "Identificar la audiencia objetivo",
  "Establecer métricas de seguimiento",
  "Optimizar en tiempo real",
];
const ACCENT_KEY = "accent";

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  const accentColor = (C as any)[ACCENT_KEY] || C.accent;
  const framesPerItem = Math.floor(dur / LIST_ITEMS.length);
  const activeItem = Math.min(Math.floor(frame / framesPerItem), LIST_ITEMS.length - 1);

  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{flexDirection:'row', gap:80}}>
        <div style={{flex:'0 0 380px', display:'flex', flexDirection:'column', justifyContent:'center'}}>
          <E d={0} from="left">
            <div style={{fontSize:42, fontWeight:700, color:C.text, lineHeight:1.3}}>{TITLE}</div>
          </E>
          {SUBTITLE && (
            <E d={8} from="left">
              <div style={{fontSize:24, color:C.dim, marginTop:16}}>{SUBTITLE}</div>
            </E>
          )}
          <E d={12} from="left">
            <AccentSeparator d={16} width={60} color={accentColor} variant="line"/>
          </E>
        </div>
        <div style={{flex:1, display:'flex', flexDirection:'column', gap:20, justifyContent:'center'}}>
          {LIST_ITEMS.map((item, i) => {
            const isActive = i === activeItem;
            const isPast = i < activeItem;
            return (
              <CascadeItem key={i} d={10} index={i}>
                <div style={{
                  display:'flex', alignItems:'center', gap:20, padding:'16px 24px',
                  borderRadius:12,
                  backgroundColor: isActive ? `${accentColor}10` : 'transparent',
                  borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
                }}>
                  <div style={{
                    width:40, height:40, borderRadius:20,
                    background: isPast ? accentColor : isActive ? `${accentColor}20` : C.card,
                    border: isPast ? 'none' : `1px solid ${isActive ? accentColor : C.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                  }}>
                    {isPast ? (
                      <LucideIcons.CheckCircle size={22} color={C.bg} strokeWidth={2.5}/>
                    ) : (
                      <span style={{fontSize:20, fontWeight:700, color: isActive ? accentColor : C.dim}}>{i + 1}</span>
                    )}
                  </div>
                  <span style={{
                    fontSize:24, fontWeight: isActive ? 700 : 400,
                    color: isActive ? C.text : isPast ? C.dim : 'rgba(255,255,255,0.4)',
                  }}>
                    {item}
                  </span>
                </div>
              </CascadeItem>
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
