// ============================================================
// TEMPLATE: CARDS
// Description: 2-3 cards in a horizontal flow with connections
// ============================================================
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, delayRender, continueRender, spring, Sequence, Img, Easing, getInputProps} from 'remotion';
import * as LucideIcons from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;

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
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const progress = interpolate(frame-d, [0, 30], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const y = from==='up'?interpolate(progress,[0,1],[50,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):from==='down'?interpolate(progress,[0,1],[-50,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
  const x = from==='left'?interpolate(progress,[0,1],[50,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):from==='right'?interpolate(progress,[0,1],[-50,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.85,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:progress,...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;
  const _fi = Math.max(1, fi);
  const _fo = Math.max(1, fo);
  const _end = Math.max(_fi + 1, dur - _fo);
  return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
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
const CLIP_START_TIME = 0; // Will be replaced by template-manager
const TITLE = "Pipeline de Datos";
const CARDS_DATA = [
  { icon: "Database", title: "Recolección", desc: "Captura de datos en tiempo real", accent: "accent" },
  { icon: "Cpu", title: "Procesamiento", desc: "Análisis con machine learning", accent: "orange" },
  { icon: "BarChart3", title: "Insights", desc: "Visualización y reportes", accent: "purple" },
];

// ============================================================
// FIXED IMPLEMENTATION — DO NOT MODIFY
// ============================================================

function readingFrames(text: string): number {
  const words = text.split(' ').length;
  if (words <= 4) return 45;
  if (words <= 8) return 75;
  return 105;
}

function itemDelay(item: {time?: number; label?: string; title?: string; text?: string}, index: number, totalItems: number, items: any[], dur: number): number {
  if (item.time !== undefined && item.time > 0) {
    return Math.round(item.time * 30);
  }
  if (index === 0) return 30;
  const prevItem = items[index - 1];
  const prevText = prevItem.label || prevItem.title || prevItem.text || '';
  const prevDelay = itemDelay(prevItem, index - 1, totalItems, items, dur);
  return Math.min(prevDelay + readingFrames(prevText), dur - 60);
}

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();
  // Font guard — block render until DM Sans loads
  const [_fontOk] = React.useState(() => { const h = delayRender("Loading font"); if (typeof document !== "undefined") { document.fonts.ready.then(() => continueRender(h)); } else { continueRender(h); } return true; });

  return (
    <Fd dur={dur} fo={10}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:48, textAlign:'center', width:'100%'}}>
          <div style={{fontSize:42, fontWeight:700, color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex', gap:40, justifyContent:'center', alignItems:'stretch', width:'100%'}}>
          {CARDS_DATA.map((card, i) => {
            const accentColor = (C as any)[card.accent] || C.accent;
            const cardStart = itemDelay(card, i, CARDS_DATA.length, CARDS_DATA, dur);
            const cardWidth = Math.min(520, Math.floor(1500 / CARDS_DATA.length));
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <E d={cardStart + 2} from="pop" style={{alignSelf:'center', flexShrink:0}}>
                    <LucideIcons.ChevronRight size={28} color={accentColor} strokeWidth={2}/>
                  </E>
                )}
                <GlowCard d={cardStart + 5} from="up" accent={accentColor}
                  elevation={i === CARDS_DATA.length - 1 ? 4 : 2}
                  active={true}
                  width={cardWidth}>
                  <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16, textAlign:'center'}}>
                    <div style={{
                      width:72, height:72, borderRadius:36, background:`${accentColor}15`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>
                      <Icon name={card.icon} size={36} color={accentColor}/>
                    </div>
                    <div style={{fontSize:26, fontWeight:700, color:C.text}}>{card.title}</div>
                    <div style={{fontSize:22, fontWeight:400, color:C.dim}}>{card.desc}</div>
                  </div>
                </GlowCard>
              </React.Fragment>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};

export const MyComposition:React.FC = () => {
  const {durationInFrames} = useVideoConfig();
  // Font guard — block render until DM Sans loads
  return (
    <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={durationInFrames} premountFor={10}>
        <Section1/>
      </Sequence>
    </AbsoluteFill>
  );
};
