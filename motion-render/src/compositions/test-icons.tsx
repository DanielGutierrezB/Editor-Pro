// ============================================================
// TEMPLATE: ICONS
// Description: 2-4 icon items in a horizontal row
// ============================================================
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, delayRender, continueRender, spring, Sequence, Img, Easing} from 'remotion';
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
const CascadeItem:React.FC<{d:number;index:number;children:React.ReactNode}> = ({d,index,children}) => {
  const frame = useCurrentFrame();
  const delay = d + index * 8;
  const dist = 40 + index * 10;
  const dur = 22 + index * 2;
  const progress = interpolate(frame - delay, [0, dur], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1), extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  return (
    <div style={{
      opacity: progress,
      transform: `translateY(${interpolate(progress,[0,1],[dist,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`,
      filter: `blur(${interpolate(progress,[0,0.5,1],[4,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`,
    }}>{children}</div>
  );
};

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const CLIP_START_TIME = 0; // Will be replaced by template-manager
const TITLE = "Nuestros Pilares";
const ITEMS = [
  { icon: "Shield", label: "Seguridad", accent: "accent" },
  { icon: "Zap", label: "Velocidad", accent: "orange" },
  { icon: "Globe", label: "Alcance", accent: "purple" },
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
  const {durationInFrames: dur} = useVideoConfig();
  // Font guard — block render until DM Sans loads
  const [_fontOk] = React.useState(() => { const h = delayRender("Loading font"); if (typeof document !== "undefined") { document.fonts.ready.then(() => continueRender(h)); } else { continueRender(h); } return true; });

  return (
    <Fd dur={dur} fo={10}>
      <Safe style={{justifyContent:'center', alignItems:'center'}}>
        <E d={0} from="up" style={{marginBottom:48, textAlign:'center'}}>
          <div style={{fontSize:42, fontWeight:700, color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex', gap:ITEMS.length <= 3 ? 140 : 100, justifyContent:'center', flexWrap:'wrap'}}>
          {ITEMS.map((item, i) => {
            const accentColor = (C as any)[item.accent] || C.accent;
            const delay = itemDelay(item, i, ITEMS.length, ITEMS, dur);
            return (
              <CascadeItem key={i} d={delay} index={0}>
                <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
                  <div style={{
                    width:180, height:180, borderRadius:90, background:C.card,
                    border:`1px solid ${accentColor}30`,
                    boxShadow:`0 0 30px ${accentColor}10, 0 8px 32px rgba(0,0,0,0.3)`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    <Icon name={item.icon} size={80} color={accentColor}/>
                  </div>
                  <div style={{fontSize:24, fontWeight:700, color:C.text, textAlign:'center'}}>
                    {item.label}
                  </div>
                </div>
              </CascadeItem>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};

export const Testicons:React.FC = () => {
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
