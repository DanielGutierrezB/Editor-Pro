import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Clock, ArrowRight } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#2d2d2d', card:'#3a3a3a', accent:'#5DADE2', green:'#52C41A',
  orange:'#FA8C16', purple:'#9254DE', red:'#F5222D', text:'#FFFFFF',
  dim:'rgba(255,255,255,0.7)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(93,173,226,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,
    display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
    ...style}}>
    {children}
  </div>
);


const TimelineLayout:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <Clock size={48} color={C.accent} />
        <div style={{fontSize:56,fontWeight:700,color:C.text}}>
          Línea del Tiempo
        </div>
      </div>
    </Anim>
    
    <Anim type="fade-up" delay={10}>
      <div style={{fontSize:32,color:C.text,textAlign:'center',marginBottom:48,maxWidth:900}}>
        Las fotos se acumulan y puedes recorrer hacia atrás cuando quieras
      </div>
    </Anim>
    
    <Anim type="fade-left" delay={20}>
      <div style={{display:'flex',alignItems:'center',gap:24,width:'100%',maxWidth:1200}}>
        <div style={{display:'flex',alignItems:'center',gap:16,flex:1}}>
          <div style={{background:C.card,borderRadius:12,width:120,height:120,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.dim}}>
            Foto 1
          </div>
          <ArrowRight size={32} color={C.dim} />
          <div style={{background:C.card,borderRadius:12,width:120,height:120,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.dim}}>
            Foto 2
          </div>
          <ArrowRight size={32} color={C.dim} />
          <div style={{background:C.card,borderRadius:12,width:120,height:120,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.dim}}>
            Foto 3
          </div>
          <ArrowRight size={32} color={C.accent} />
          <div style={{background:C.accent,borderRadius:12,width:120,height:120,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:C.bg,fontWeight:700}}>
            Actual
          </div>
        </div>
      </div>
    </Anim>
    
    <Anim type="fade" delay={30}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginTop:32}}>
        <ArrowRight size={32} color={C.accent} style={{transform:'rotate(180deg)'}} />
        <div style={{fontSize:28,color:C.accent}}>
          Navegar hacia atrás
        </div>
      </div>
    </Anim>
  </Safe>
);


// ─── Animation Engine (auto-injected) ──────────────────────────────────────
const Anim:React.FC<{type?:string;delay?:number;children:React.ReactNode;style?:React.CSSProperties}> = ({type='fade-up',delay=0,children,style}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  // 24 frames = 0.8s entrance with smooth deceleration
  const p = interpolate(f, [0, 24], [0, 1], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  let transform = '';
  switch(type) {
    case 'fade-up':    transform = `translateY(${interpolate(p,[0,1],[40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-down':  transform = `translateY(${interpolate(p,[0,1],[-40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-left':  transform = `translateX(${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-right': transform = `translateX(${interpolate(p,[0,1],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'pop':        transform = `scale(${interpolate(p,[0,1],[0.85,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`; break;
    case 'fade':       transform = ''; break;
    default:           transform = `translateY(${interpolate(p,[0,1],[40,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
  }
  return <div style={{opacity:p, transform: transform || undefined, ...style}}>{children}</div>;
};


// ─── Section Engine (auto-injected) ────────────────────────────────────────
const SectionFade:React.FC<{dur:number;children:React.ReactNode}> = ({dur,children}) => {
  const frame = useCurrentFrame();
  // 15 frames (0.5s) fade in, 15 frames fade out — smooth section transitions
  const fi = 15;
  const fo = 15;
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeIn = interpolate(frame, [0, fi], [0, 1], {
    easing: Easing.bezier(0.25, 1, 0.5, 1),
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const fadeOut = interpolate(frame, [endStart, dur], [1, 0], {
    easing: Easing.bezier(0.5, 0, 0.75, 0),
    extrapolateLeft:'clamp', extrapolateRight:'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};

const Section:React.FC<{from:number;dur:number;children:React.ReactNode}> = ({from,dur,children}) => (
  <Sequence from={from} durationInFrames={dur} layout="none">
    <SectionFade dur={dur}>{children}</SectionFade>
  </Sequence>
);

export const M03Timeline262605V1091051:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <TimelineLayout />
  </AbsoluteFill>
);