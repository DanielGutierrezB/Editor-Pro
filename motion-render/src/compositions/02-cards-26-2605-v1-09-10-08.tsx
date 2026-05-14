import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Tag, Palette, Menu } from 'lucide-react';

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

const Slide1:React.FC = () => (
  <Safe>
    <Anim type="fade-down" delay={0}>
      <Tag size={64} color={C.accent} style={{marginBottom:24}} />
    </Anim>
    <Anim type="pop" delay={8}>
      <div style={{fontSize:64,fontWeight:700,color:C.text,textAlign:'center'}}>
        Etiquetas en Git
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:32,color:C.dim,textAlign:'center',marginTop:16,maxWidth:900}}>
        Cada cambio queda guardado con una descripción clara
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{display:'flex',gap:32,alignItems:'center'}}>
        <div style={{
          background:`linear-gradient(135deg, ${C.card}, ${C.bg})`,
          borderRadius:16,
          padding:'32px 40px',
          display:'flex',
          flexDirection:'column',
          alignItems:'center',
          gap:16,
          minWidth:280,
          boxShadow:`0 0 40px ${C.glow}`
        }}>
          <Menu size={48} color={C.accent} />
          <div style={{fontSize:28,fontWeight:700,color:C.text,textAlign:'center'}}>
            "Agregué el menú"
          </div>
          <div style={{
            background:C.accent,
            color:C.bg,
            padding:'8px 16px',
            borderRadius:20,
            fontSize:20,
            fontWeight:700
          }}>
            ETIQUETA
          </div>
        </div>
        
        <div style={{
          background:`linear-gradient(135deg, ${C.card}, ${C.bg})`,
          borderRadius:16,
          padding:'32px 40px',
          display:'flex',
          flexDirection:'column',
          alignItems:'center',
          gap:16,
          minWidth:280,
          boxShadow:`0 0 40px ${C.glow}`
        }}>
          <Palette size={48} color={C.purple} />
          <div style={{fontSize:28,fontWeight:700,color:C.text,textAlign:'center'}}>
            "Cambié los colores del header"
          </div>
          <div style={{
            background:C.purple,
            color:C.bg,
            padding:'8px 16px',
            borderRadius:20,
            fontSize:20,
            fontWeight:700
          }}>
            ETIQUETA
          </div>
        </div>
      </div>
    </Anim>
  </Safe>
);

export const M02Cards262605V1091008:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={136}><Slide1/></Section>
    <Section from={136} dur={137}><Slide2/></Section>
  </AbsoluteFill>
);