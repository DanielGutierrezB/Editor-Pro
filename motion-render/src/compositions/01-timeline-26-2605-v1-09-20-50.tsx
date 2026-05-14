import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Camera, Clock, ArrowLeft, Folder } from 'lucide-react';

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
    <Anim type="pop" delay={0}>
      <div style={{fontSize:72,fontWeight:700,color:C.accent,textAlign:'center'}}>
        ¿Qué es Git?
      </div>
    </Anim>
    <Anim type="fade-up" delay={10}>
      <div style={{fontSize:32,color:C.text,textAlign:'center',marginTop:24,maxWidth:900}}>
        Una máquina del tiempo para tu proyecto
      </div>
    </Anim>
    <Anim type="fade-up" delay={20}>
      <div style={{display:'flex',gap:32,marginTop:48}}>
        <Img src={staticFile('logos/github.svg')} style={{width:80,height:80}} />
        <Clock size={80} color={C.accent} />
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <Camera size={64} color={C.accent} style={{marginBottom:24}} />
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center'}}>
        Tomas una foto del estado completo
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:28,color:C.dim,textAlign:'center',marginTop:16}}>
        Cada vez que avanzas en tu proyecto
      </div>
    </Anim>
    <Anim type="pop" delay={24}>
      <div style={{display:'flex',gap:24,marginTop:40}}>
        <div style={{background:C.card,borderRadius:12,padding:24,display:'flex',alignItems:'center',gap:16}}>
          <Folder size={48} color={C.accent} />
          <div style={{fontSize:24,color:C.text}}>Tu carpeta completa</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide3:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center'}}>
        Cada foto tiene una etiqueta
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{display:'flex',flexDirection:'column',gap:20,marginTop:40}}>
        <div style={{background:`linear-gradient(135deg, ${C.card}, ${C.bg})`,borderRadius:16,padding:'20px 32px',fontSize:28,color:C.text}}>
          "Agregué el menú"
        </div>
        <div style={{background:`linear-gradient(135deg, ${C.card}, ${C.bg})`,borderRadius:16,padding:'20px 32px',fontSize:28,color:C.text}}>
          "Cambié los colores del header"
        </div>
      </div>
    </Anim>
    <Anim type="fade" delay={16}>
      <div style={{fontSize:24,color:C.dim,textAlign:'center',marginTop:32}}>
        Tú escribes qué cambios hiciste
      </div>
    </Anim>
  </Safe>
);

const Slide4:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center'}}>
        Una línea del tiempo navegable
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{display:'flex',alignItems:'center',gap:24,marginTop:40}}>
        <div style={{width:120,height:4,background:C.dim,borderRadius:2}} />
        <div style={{width:16,height:16,background:C.accent,borderRadius:'50%'}} />
        <div style={{width:16,height:16,background:C.accent,borderRadius:'50%'}} />
        <div style={{width:16,height:16,background:C.accent,borderRadius:'50%'}} />
        <div style={{width:120,height:4,background:C.dim,borderRadius:2}} />
      </div>
    </Anim>
    <Anim type="pop" delay={16}>
      <ArrowLeft size={64} color={C.accent} style={{marginTop:24}} />
    </Anim>
    <Anim type="fade-up" delay={24}>
      <div style={{fontSize:28,color:C.text,textAlign:'center',marginTop:24}}>
        Puedes recorrer hacia atrás cuando quieras
      </div>
    </Anim>
  </Safe>
);

export const M01Timeline262605V1092050:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={213}><Slide1/></Section>
    <Section from={213} dur={213}><Slide2/></Section>
    <Section from={426} dur={213}><Slide3/></Section>
    <Section from={639} dur={213}><Slide4/></Section>
  </AbsoluteFill>
);