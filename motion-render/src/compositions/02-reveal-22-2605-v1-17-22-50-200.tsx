import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Search, AlertCircle, CheckCircle2, Clock, MessageSquare, Coffee } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#f8f9fa', card:'#ffffff', accent:'#5DADE2', green:'#52C41A',
  orange:'#FA8C16', purple:'#9254DE', red:'#F5222D', text:'#1a1d23',
  dim:'rgba(0,0,0,0.55)', border:'rgba(0,0,0,0.08)',
  glow:'rgba(10,233,141,0.06)',
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
      <Search size={80} color={C.accent} style={{marginBottom:24}} />
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:64,fontWeight:700,color:C.text,textAlign:'center'}}>
        DevTools: Tu Traductor de Problemas
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:32,color:C.dim,textAlign:'center',marginTop:20}}>
        La diferencia entre frustración y solución rápida
      </div>
    </Anim>
  </Safe>
);

const Slide2:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{display:'flex',gap:40,width:'100%',maxWidth:1200}}>
        <div style={{flex:1,background:C.card,borderRadius:16,padding:40,border:`3px solid ${C.red}`}}>
          <AlertCircle size={48} color={C.red} style={{marginBottom:16}} />
          <div style={{fontSize:36,fontWeight:700,color:C.red,marginBottom:20}}>Sin DevTools</div>
          <div style={{fontSize:28,color:C.text,lineHeight:1.4}}>
            "Mi botón no funciona, ayuda"
          </div>
          <div style={{fontSize:24,color:C.dim,marginTop:16}}>
            Pregunta vaga = respuesta vaga
          </div>
        </div>
        <div style={{flex:1,background:C.card,borderRadius:16,padding:40,border:`3px solid ${C.green}`}}>
          <CheckCircle2 size={48} color={C.green} style={{marginBottom:16}} />
          <div style={{fontSize:36,fontWeight:700,color:C.green,marginBottom:20}}>Con DevTools</div>
          <div style={{fontSize:28,color:C.text,lineHeight:1.4}}>
            "El botón de reservas tiene padding en cero, aunque le asigné padding: 16px"
          </div>
          <div style={{fontSize:24,color:C.dim,marginTop:16}}>
            Diagnóstico preciso = solución inmediata
          </div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide3:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,marginBottom:40}}>
        El Proceso: 30 Segundos que Ahorran Horas
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{display:'flex',gap:32,alignItems:'center'}}>
        <div style={{background:C.card,borderRadius:16,padding:32,textAlign:'center',minWidth:280}}>
          <div style={{fontSize:64,fontWeight:700,color:C.accent,marginBottom:16}}>1</div>
          <div style={{fontSize:28,fontWeight:700,color:C.text,marginBottom:8}}>Problema detectado</div>
          <div style={{fontSize:24,color:C.dim}}>Botón mal alineado</div>
        </div>
        <div style={{fontSize:48,color:C.accent}}>→</div>
        <div style={{background:C.card,borderRadius:16,padding:32,textAlign:'center',minWidth:280}}>
          <div style={{fontSize:64,fontWeight:700,color:C.accent,marginBottom:16}}>2</div>
          <div style={{fontSize:28,fontWeight:700,color:C.text,marginBottom:8}}>Abrir DevTools</div>
          <div style={{fontSize:24,color:C.dim}}>Ver padding: 0, margen inesperado</div>
        </div>
        <div style={{fontSize:48,color:C.accent}}>→</div>
        <div style={{background:C.card,borderRadius:16,padding:32,textAlign:'center',minWidth:280}}>
          <div style={{fontSize:64,fontWeight:700,color:C.accent,marginBottom:16}}>3</div>
          <div style={{fontSize:28,fontWeight:700,color:C.text,marginBottom:8}}>Diagnóstico preciso</div>
          <div style={{fontSize:24,color:C.dim}}>Regla CSS sobreescribiendo</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide4:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{fontSize:48,fontWeight:700,color:C.text,marginBottom:40}}>
        El Flujo de Información
      </div>
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{background:C.card,borderRadius:16,padding:32,marginBottom:24,width:'80%'}}>
        <div style={{fontSize:32,fontWeight:700,color:C.accent,marginBottom:12}}>Lo que ves</div>
        <div style={{fontSize:28,color:C.text}}>Un botón que no se ve como esperas</div>
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{fontSize:36,color:C.accent,marginBottom:24}}>↓</div>
    </Anim>
    <Anim type="fade-up" delay={24}>
      <div style={{background:C.card,borderRadius:16,padding:32,marginBottom:24,width:'80%'}}>
        <div style={{fontSize:32,fontWeight:700,color:C.accent,marginBottom:12}}>Lo que DevTools revela</div>
        <div style={{fontSize:28,color:C.text,fontFamily:'monospace'}}>padding: 0px !important;</div>
      </div>
    </Anim>
    <Anim type="fade-up" delay={32}>
      <div style={{fontSize:36,color:C.accent,marginBottom:24}}>↓</div>
    </Anim>
    <Anim type="fade-up" delay={40}>
      <div style={{background:C.card,borderRadius:16,padding:32,width:'80%'}}>
        <div style={{fontSize:32,fontWeight:700,color:C.accent,marginBottom:12}}>Lo que preguntas a la IA</div>
        <div style={{fontSize:28,color:C.text}}>Pregunta específica con contexto técnico</div>
      </div>
    </Anim>
  </Safe>
);

const Slide5:React.FC = () => (
  <Safe>
    <Anim type="fade-up" delay={0}>
      <div style={{display:'flex',gap:60,alignItems:'center'}}>
        <div style={{textAlign:'center'}}>
          <Clock size={64} color={C.red} style={{marginBottom:20}} />
          <div style={{fontSize:36,fontWeight:700,color:C.text,marginBottom:16}}>Sin DevTools</div>
          <div style={{fontSize:48,fontWeight:700,color:C.red,marginBottom:20}}>20 minutos</div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <MessageSquare size={32} color={C.dim} />
            <MessageSquare size={32} color={C.dim} />
            <MessageSquare size={32} color={C.dim} />
          </div>
          <div style={{fontSize:24,color:C.dim,marginTop:16}}>Múltiples idas y vueltas</div>
        </div>
        <div style={{fontSize:64,color:C.accent}}>VS</div>
        <div style={{textAlign:'center'}}>
          <CheckCircle2 size={64} color={C.green} style={{marginBottom:20}} />
          <div style={{fontSize:36,fontWeight:700,color:C.text,marginBottom:16}}>Con DevTools</div>
          <div style={{fontSize:48,fontWeight:700,color:C.green,marginBottom:20}}>Respuesta inmediata</div>
          <MessageSquare size={48} color={C.green} />
          <div style={{fontSize:24,color:C.dim,marginTop:16}}>Una pregunta, una solución</div>
        </div>
      </div>
    </Anim>
  </Safe>
);

const Slide6:React.FC = () => (
  <Safe>
    <Anim type="pop" delay={0}>
      <Coffee size={80} color={C.accent} style={{marginBottom:24}} />
    </Anim>
    <Anim type="fade-up" delay={8}>
      <div style={{fontSize:56,fontWeight:700,color:C.text,textAlign:'center',marginBottom:24}}>
        Ejercicio: Inspecciona Blue Bottle
      </div>
    </Anim>
    <Anim type="fade-up" delay={16}>
      <div style={{background:C.card,borderRadius:16,padding:40,textAlign:'center'}}>
        <div style={{fontSize:32,color:C.text,marginBottom:20}}>
          Dedica 2 minutos • Encuentra una etiqueta nueva • Comparte en comentarios
        </div>
      </div>
    </Anim>
    <Anim type="fade-up" delay={24}>
      <div style={{fontSize:36,fontWeight:700,color:C.accent,textAlign:'center',marginTop:32}}>
        DevTools te da el vocabulario para preguntar mejor
      </div>
    </Anim>
  </Safe>
);

export const M02Reveal222605V1172250200:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Section from={0} dur={646}><Slide1/></Section>
    <Section from={646} dur={646}><Slide2/></Section>
    <Section from={1292} dur={646}><Slide3/></Section>
    <Section from={1938} dur={646}><Slide4/></Section>
    <Section from={2584} dur={646}><Slide5/></Section>
    <Section from={3230} dur={649}><Slide6/></Section>
  </AbsoluteFill>
);