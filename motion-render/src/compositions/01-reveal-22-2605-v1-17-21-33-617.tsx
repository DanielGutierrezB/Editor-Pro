import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Monitor, Search, AlertTriangle, Palette, RotateCw, Brain, Bug, Code } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#2d2d2d', card:'#3a3a3a', accent:'#5DADE2', green:'#52C41A',
  orange:'#FA8C16', purple:'#9254DE', red:'#F5222D', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(93,173,226,0.1)',
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
      <Monitor size={72} color={C.accent} strokeWidth={2}/>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:64,fontWeight:700,color:C.text,textAlign:'center',marginTop:24}}>
        Herramientas de Desarrollo del Navegador
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:32,color:C.accent,textAlign:'center',marginTop:16}}>
        Lo que te permite ver todo
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center'}}>
        Las has abierto varias veces
      </div>
    </Anim>
    <Anim type="pop" delay={8}>
      <RotateCw size={56} color={C.accent} strokeWidth={2} style={{marginTop:20}}/>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{display:'flex',gap:20,marginTop:32}}>
        <div style={{background:C.card,borderRadius:12,padding:'20px 28px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <Search size={32} color={C.accent}/>
          <div style={{fontSize:24,color:C.text}}>Inspeccionar elementos</div>
        </div>
        <div style={{background:C.card,borderRadius:12,padding:'20px 28px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <AlertTriangle size={32} color={C.orange}/>
          <div style={{fontSize:24,color:C.text}}>Ver errores</div>
        </div>
        <div style={{background:C.card,borderRadius:12,padding:'20px 28px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <Palette size={32} color={C.purple}/>
          <div style={{fontSize:24,color:C.text}}>Revisar estilos</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide3:React.FC = () => (
  <Safe>
    <Anim type="pop" delay={0}>
      <div style={{fontSize:120,fontWeight:700,color:C.accent,textAlign:'center'}}>
        #1
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:36,fontWeight:700,color:C.text,textAlign:'center',marginTop:8,maxWidth:900}}>
        Herramienta más subutilizada por principiantes
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{background:C.card,borderRadius:16,padding:'24px 40px',marginTop:32,width:'80%'}}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <div style={{fontSize:24,color:C.dim,marginBottom:8}}>Uso actual</div>
            <div style={{background:C.bg,borderRadius:8,height:32,position:'relative',overflow:'hidden'}}>
              <div style={{background:C.red,height:'100%',width:'20%',borderRadius:8}}/>
              <div style={{position:'absolute',left:12,top:4,fontSize:20,fontWeight:700,color:C.text}}>20%</div>
            </div>
          </div>
          <div>
            <div style={{fontSize:24,color:C.dim,marginBottom:8}}>Potencial</div>
            <div style={{background:C.bg,borderRadius:8,height:32,position:'relative',overflow:'hidden'}}>
              <div style={{background:C.accent,height:'100%',width:'100%',borderRadius:8}}/>
              <div style={{position:'absolute',left:12,top:4,fontSize:20,fontWeight:700,color:C.text}}>100%</div>
            </div>
          </div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide4:React.FC = () => (
  <Safe>
    <Anim type="pop" delay={0}>
      <Brain size={80} color={C.accent} strokeWidth={2}/>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:52,fontWeight:700,color:C.text,textAlign:'center',marginTop:20}}>
        Tu mejor aliada con IA
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{display:'flex',gap:24,marginTop:32}}>
        <div style={{background:C.card,borderRadius:16,padding:'28px 36px',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
          <Bug size={48} color={C.orange}/>
          <div style={{fontSize:28,color:C.text,textAlign:'center'}}>Debuggear respuestas de IA</div>
        </div>
        <div style={{background:C.card,borderRadius:16,padding:'28px 36px',display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
          <Code size={48} color={C.green}/>
          <div style={{fontSize:28,color:C.text,textAlign:'center'}}>Entender código generado</div>
        </div>
      </div>
    </Anim>
    <Anim type="fade-up" delay={24}>
      <div style={{background:`linear-gradient(135deg, ${C.accent}22, ${C.accent}11)`,borderRadius:12,padding:'20px 32px',marginTop:32,borderLeft:`4px solid ${C.accent}`}}>
        <div style={{fontSize:26,color:C.text,textAlign:'center'}}>
          Una de las que más te va a servir cuando trabajes con inteligencia artificial
        </div>
      </div>
    </Anim>
  </Safe>
);

export const M01Reveal222605V1172133617:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={196}><Slide1/></Section>
    <Section from={196} dur={196}><Slide2/></Section>
    <Section from={392} dur={196}><Slide3/></Section>
    <Section from={588} dur={198}><Slide4/></Section>
  </AbsoluteFill>
);