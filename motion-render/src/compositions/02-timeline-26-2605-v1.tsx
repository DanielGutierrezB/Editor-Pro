import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Camera, Clock, ArrowLeft, ArrowRight } from 'lucide-react';

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



// ─── Animation Engine (auto-injected, do not modify) ───────────────────────
const Anim:React.FC<{type?:string;delay?:number;children:React.ReactNode;style?:React.CSSProperties}> = ({type='fade-up',delay=0,children,style}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const p = interpolate(f, [0, 18], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  let transform = '';
  switch(type) {
    case 'fade-up':    transform = `translateY(${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-down':  transform = `translateY(${interpolate(p,[0,1],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-left':  transform = `translateX(${interpolate(p,[0,1],[80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-right': transform = `translateX(${interpolate(p,[0,1],[-80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'pop':        transform = `scale(${interpolate(p,[0,1],[0.7,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`; break;
    case 'fade':       transform = ''; break;
    default:           transform = `translateY(${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
  }
  return <div style={{opacity:p, transform: transform || undefined, ...style}}>{children}</div>;
};


// ─── Section Engine (auto-injected, do not modify) ─────────────────────────
const SectionFade:React.FC<{dur:number;children:React.ReactNode}> = ({dur,children}) => {
  const frame = useCurrentFrame();
  const fi = 12;
  const fo = 12;
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeIn = interpolate(frame, [0, fi], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const fadeOut = interpolate(frame, [endStart, dur], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
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
      <Camera size={64} color={C.accent} />
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:56,fontWeight:700,color:C.text,textAlign:'center',marginTop:24}}>
        Cada foto se guarda con tu etiqueta
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{display:'flex',gap:32,marginTop:40}}>
        <div style={{background:C.card,borderRadius:16,padding:'24px 32px',display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:24,color:C.dim}}>Ejemplo:</div>
          <div style={{fontSize:28,color:C.text,fontWeight:700}}>"Agregué el menú"</div>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:'24px 32px',display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:24,color:C.dim}}>Ejemplo:</div>
          <div style={{fontSize:28,color:C.text,fontWeight:700}}>"Cambié los colores del header"</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:56,fontWeight:700,color:C.text,textAlign:'center'}}>
        Línea del tiempo navegable
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{display:'flex',alignItems:'center',gap:24,marginTop:40}}>
        <ArrowLeft size={48} color={C.accent} />
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{width:80,height:80,background:C.card,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Camera size={32} color={C.dim} />
          </div>
          <div style={{width:60,height:2,background:C.accent}} />
          <div style={{width:100,height:100,background:`linear-gradient(135deg, ${C.accent}, ${C.card})`,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 0 20px ${C.glow}`}}>
            <Camera size={40} color={C.text} />
          </div>
          <div style={{width:60,height:2,background:C.accent}} />
          <div style={{width:80,height:80,background:C.card,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Camera size={32} color={C.dim} />
          </div>
        </div>
        <ArrowRight size={48} color={C.accent} />
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:32,color:C.text,textAlign:'center',marginTop:32}}>
        Puedes recorrer hacia atrás cuando quieras
      </div>
    </Anim>
    <Anim type="pop" delay={24}>
      <Clock size={48} color={C.accent} style={{marginTop:24}} />
    </Anim>
  </Safe>
);

export const M02Timeline262605V1:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={224}><Slide1/></Section>
    <Section from={224} dur={223}><Slide2/></Section>
  </AbsoluteFill>
);