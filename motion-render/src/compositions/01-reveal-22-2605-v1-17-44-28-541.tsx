import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Code2, MousePointer, Brain, Weight, TrendingDown, Rocket, Sparkles, CheckCircle } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#f8f9fa', card:'rgba(244,208,63,0.06)', accent:'#806d21', green:'#4e6d41',
  orange:'#a25845', purple:'#766a88', red:'#9a5043', text:'#1a1d23',
  dim:'rgba(0,0,0,0.55)', border:'rgba(0,0,0,0.10)',
  glow:'rgba(244,208,63,0.08)',
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
    <Anim type="pop" delay={1}>
      <Code2 size={72} color={C.accent} style={{marginBottom:24}}/>
    </Anim>
    <Anim type="fade-up" delay={1}>
      <div style={{fontSize:64,fontWeight:700,color:C.text,textAlign:'center'}}>
        Herramientas de Desarrollo del Navegador
      </div>
    </Anim>
    <Anim type="fade-up" delay={61}>
      <div style={{fontSize:32,color:C.dim,textAlign:'center',marginTop:20}}>
        Lo que te permite ver detrás del código
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{display:'flex',gap:32,flexDirection:'row'}}>
        <div style={{background:C.card,borderRadius:16,padding:32,flex:1,textAlign:'center'}}>
          <MousePointer size={48} color={C.orange} style={{margin:'0 auto 16px'}}/>
          <div style={{fontSize:28,fontWeight:700,color:C.text}}>Las has abierto varias veces</div>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:32,flex:1,textAlign:'center'}}>
          <Brain size={48} color={C.purple} style={{margin:'0 auto 16px'}}/>
          <div style={{fontSize:28,fontWeight:700,color:C.text}}>Sin pensar mucho</div>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:32,flex:1,textAlign:'center'}}>
          <Weight size={48} color={C.accent} style={{margin:'0 auto 16px'}}/>
          <div style={{fontSize:28,fontWeight:700,color:C.text}}>Hoy les daremos peso</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide3:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={421}>
      <div style={{background:`linear-gradient(135deg, ${C.red}15, ${C.card})`,borderRadius:20,padding:40,marginBottom:24,width:'100%',maxWidth:900}}>
        <div style={{display:'flex',alignItems:'center',gap:20,justifyContent:'center'}}>
          <TrendingDown size={56} color={C.red}/>
          <div style={{fontSize:48,fontWeight:700,color:C.text}}>Más subutilizadas</div>
        </div>
        <div style={{fontSize:28,color:C.dim,textAlign:'center',marginTop:16}}>
          Por la gente que está empezando
        </div>
      </div>
    </Anim>
    <Anim type="fade-up" delay={601}>
      <div style={{background:`linear-gradient(135deg, ${C.green}15, ${C.card})`,borderRadius:20,padding:40,width:'100%',maxWidth:900}}>
        <div style={{display:'flex',alignItems:'center',gap:20,justifyContent:'center'}}>
          <Rocket size={56} color={C.green}/>
          <div style={{fontSize:48,fontWeight:700,color:C.text}}>Más útiles</div>
        </div>
        <div style={{fontSize:28,color:C.dim,textAlign:'center',marginTop:16}}>
          Cuando trabajes con inteligencia artificial
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide4:React.FC = () => (
  <Safe>
    <Anim type="pop" delay={0}>
      <div style={{display:'flex',alignItems:'center',gap:24,marginBottom:32}}>
        <Code2 size={64} color={C.accent}/>
        <Sparkles size={64} color={C.purple}/>
      </div>
    </Anim>
    <Anim type="fade-up" delay={10}>
      <div style={{fontSize:56,fontWeight:700,color:C.text,textAlign:'center',maxWidth:1000}}>
        Tu aliado esencial con la Inteligencia Artificial
      </div>
    </Anim>
    <Anim type="pop" delay={20}>
      <div style={{background:C.green,color:'#fff',borderRadius:12,padding:'12px 24px',fontSize:24,fontWeight:700,marginTop:40,display:'flex',alignItems:'center',gap:8}}>
        <CheckCircle size={24}/>
        Listo
      </div>
    </Anim>
  </Safe>
);

export const M01Reveal222605V1174428541:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={195}><Slide1/></Section>
    <Section from={195} dur={195}><Slide2/></Section>
    <Section from={390} dur={195}><Slide3/></Section>
    <Section from={585} dur={195}><Slide4/></Section>
  </AbsoluteFill>
);