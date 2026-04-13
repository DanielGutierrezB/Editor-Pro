// ============================================================
// TEMPLATE: TIMELINE
// Description: Horizontal timeline with progressive node reveal
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
  const progress = interpolate(frame-d, [0, 30], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
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

// ============================================================
// CONTENT BLOCK — AI fills ONLY this section
// ============================================================
const CLIP_START_TIME = 0; // Will be replaced by template-manager
const TITLE = "Evolución del Proyecto";
const EVENTS = [
  { icon: "Lightbulb", label: "Idea", time: "2022", accent: "accent" },
  { icon: "Code", label: "Desarrollo", time: "2023", accent: "orange" },
  { icon: "Rocket", label: "Lanzamiento", time: "2024", accent: "purple" },
  { icon: "TrendingUp", label: "Crecimiento", time: "2025", accent: "green" },
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

function eventDelay(item: {showTime?: number; label?: string; title?: string; text?: string}, index: number, totalItems: number, items: any[], dur: number): number {
  if (item.showTime !== undefined && item.showTime > 0) {
    return Math.round(item.showTime * 30);
  }
  if (index === 0) return 20;
  const prevItem = items[index - 1];
  const prevText = prevItem.label || prevItem.title || prevItem.text || '';
  const prevDelay = eventDelay(prevItem, index - 1, totalItems, items, dur);
  return Math.min(prevDelay + readingFrames(prevText), dur - 60);
}

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames: dur} = useVideoConfig();

  const lineProgress = interpolate(frame, [10, 50], [0, 1], {
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });

  const nodeSpacing = Math.floor(1400 / Math.max(EVENTS.length - 1, 1));

  return (
    <Fd dur={dur} fo={10}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:48, textAlign:'center', width:'100%'}}>
          <div style={{fontSize:42, fontWeight:700, color:C.text}}>{TITLE}</div>
        </E>
        <div style={{position:'relative', width:'100%', height:300}}>
          <div style={{
            position:'absolute', top:80, left:40, right:40, height:3,
            backgroundColor:C.border, borderRadius:2,
          }}>
            <div style={{
              height:'100%', width:`${lineProgress * 100}%`,
              background:`linear-gradient(90deg, ${C.accent}, ${(C as any)[EVENTS[EVENTS.length-1].accent] || C.accent})`,
              borderRadius:2,
            }}/>
          </div>
          {EVENTS.map((event, i) => {
            const accentColor = (C as any)[event.accent] || C.accent;
            const nodeStart = eventDelay(event, i, EVENTS.length, EVENTS, dur);
            const xPos = 40 + i * nodeSpacing;
            return (
              <E key={i} d={nodeStart} from="pop" style={{
                position:'absolute', left:xPos, top:48,
                display:'flex', flexDirection:'column', alignItems:'center',
                transform:'translateX(-50%)',
              }}>
                <div style={{
                  width:64, height:64, borderRadius:32, background:C.card,
                  border:`2px solid ${accentColor}`,
                  boxShadow:`0 0 20px ${accentColor}15`,
                  display:'flex', alignItems:'center', justifyContent:'center', zIndex:2,
                }}>
                  <Icon name={event.icon} size={28} color={accentColor}/>
                </div>
                <div style={{marginTop:16, textAlign:'center'}}>
                  <div style={{fontSize:22, fontWeight:700, color:C.text}}>{event.label}</div>
                  <div style={{fontSize:20, fontWeight:400, color:C.dim, marginTop:4}}>{event.time}</div>
                </div>
              </E>
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
