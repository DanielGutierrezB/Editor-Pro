import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { BarChart3, Search, Lightbulb, Target } from 'lucide-react';

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', green:'#0ae98d',
  orange:'#fb923c', purple:'#a78bfa', red:'#f87171', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(10,233,141,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const ProgressDots:React.FC<{currentStep:number;totalSteps:number;d:number}> = ({currentStep,totalSteps,d}) => (
  <E d={d} from="right" style={{display:'flex',flexDirection:'column',gap:20,justifyContent:'center'}}>
    {Array.from({length:totalSteps}).map((_,i) => (
      <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{
          width:16,height:16,borderRadius:8,
          background: i < currentStep ? C.dim : i === currentStep ? C.accent : 'transparent',
          border: i === currentStep ? `2px solid ${C.accent}` : `1px solid ${C.dim}`,
          boxShadow: i === currentStep ? `0 0 12px ${C.accent}33` : 'none'
        }} />
        <span style={{fontSize:18,color: i === currentStep ? C.text : C.dim,fontWeight: i === currentStep ? 700 : 400,fontFamily:"'DM Sans',sans-serif"}}>
          {i === 0 ? 'Contexto' : i === 1 ? 'Hallazgo' : i === 2 ? 'Interpretación' : 'Acción'}
        </span>
      </div>
    ))}
  </E>
);

const StepView:React.FC<{step:number;icon:React.ReactNode;title:string;example:string;accent:string;d:number}> = ({step,icon,title,example,accent,d}) => (
  <Safe style={{flexDirection:'row',gap:80,alignItems:'center'}}>
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
      <E d={d} from="left">
        <div style={{
          width:160,height:160,borderRadius:80,
          background:C.card,border:`2px solid ${accent}`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${accent}22`
        }}>
          {icon}
        </div>
      </E>
      <E d={d+15} from="up">
        <div style={{fontSize:42,fontWeight:700,color:accent,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      </E>
      <E d={d+25} from="up">
        <div style={{fontSize:22,color:C.text,textAlign:'center',maxWidth:600,lineHeight:1.5,fontFamily:"'DM Sans',sans-serif"}}>{example}</div>
      </E>
    </div>
    <ProgressDots currentStep={step} totalSteps={4} d={d+35} />
  </Safe>
);

const IntroSection:React.FC = () => (
  <Safe>
    <E d={0} from="up">
      <div style={{fontSize:56,fontWeight:700,color:C.accent,textAlign:'center',marginBottom:20,fontFamily:"'DM Sans',sans-serif"}}>
        La Estructura Perfecta
      </div>
    </E>
    <E d={15} from="up">
      <div style={{fontSize:28,color:C.dim,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
        Cuatro pasos que funcionan siempre
      </div>
    </E>
    <E d={30} from="up">
      <div style={{width:80,height:3,background:C.accent,marginTop:30,borderRadius:2}} />
    </E>
  </Safe>
);

export const M4Steps062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={135}>
        <Fd dur={135} fi={10} fo={10}>
          <IntroSection />
        </Fd>
      </Sequence>

      <Sequence from={135} durationInFrames={210}>
        <Fd dur={210} fi={10} fo={10}>
          <StepView 
            step={0}
            icon={<BarChart3 size={80} color={C.accent} strokeWidth={1.5} />}
            title="1. CONTEXTO"
            example="CTR está en 0.6% por debajo del 1% que normalmente genera esta cuenta"
            accent={C.accent}
            d={0}
          />
        </Fd>
      </Sequence>

      <Sequence from={345} durationInFrames={180}>
        <Fd dur={180} fi={10} fo={10}>
          <StepView 
            step={1}
            icon={<Search size={80} color={C.orange} strokeWidth={1.5} />}
            title="2. HALLAZGO"
            example="Identificación del problema específico que estás observando"
            accent={C.orange}
            d={0}
          />
        </Fd>
      </Sequence>

      <Sequence from={525} durationInFrames={240}>
        <Fd dur={240} fi={10} fo={10}>
          <StepView 
            step={2}
            icon={<Lightbulb size={80} color={C.purple} strokeWidth={1.5} />}
            title="3. INTERPRETACIÓN"
            example="El creativo tiene más de 3 semanas activo, probablemente está entrando en fatiga"
            accent={C.purple}
            d={0}
          />
        </Fd>
      </Sequence>

      <Sequence from={765} durationInFrames={360}>
        <Fd dur={360} fi={10} fo={1}>
          <StepView 
            step={3}
            icon={<Target size={80} color={C.red} strokeWidth={1.5} />}
            title="4. ACCIÓN"
            example="Duplicar el asset y probar dos nuevos creativos con hooks distintos esta semana"
            accent={C.red}
            d={0}
          />
        </Fd>
      </Sequence>
    </AbsoluteFill>
  );
};