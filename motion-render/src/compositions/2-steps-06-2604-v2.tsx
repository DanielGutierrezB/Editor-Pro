import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { MessageSquare, Shield, Search } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

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

const ProgressDots:React.FC<{current:number; total:number; d:number}> = ({current,total,d}) => (
  <E d={d} from="right" style={{display:'flex',flexDirection:'column',gap:20,justifyContent:'center'}}>
    {Array.from({length:total}).map((_,i) => (
      <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{
          width:16,height:16,borderRadius:8,
          background: i < current ? C.dim : i === current ? C.accent : 'transparent',
          border: i === current ? `2px solid ${C.accent}` : `1px solid ${C.dim}`,
          boxShadow: i === current ? `0 0 12px ${C.glow}` : 'none'
        }} />
        <span style={{fontSize:16,color: i === current ? C.text : C.dim,fontWeight: i === current ? 700 : 400,fontFamily:"'DM Sans',sans-serif"}}>
          Paso {i+1}
        </span>
      </div>
    ))}
  </E>
);

const IntroSection:React.FC = () => (
  <Fd dur={90} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center',marginBottom:20,fontFamily:"'DM Sans',sans-serif"}}>
          Storytelling con Data
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24,color:C.dim,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          Tres habilidades esenciales
        </div>
      </E>
    </Safe>
  </Fd>
);

const Step1Section:React.FC = () => (
  <Fd dur={120} fi={10} fo={10}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:160,height:160,borderRadius:80,
          background:C.card,border:`2px solid ${C.accent}`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${C.glow}`
        }}>
          <MessageSquare size={80} color={C.accent} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:36,fontWeight:700,color:C.accent,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          Explicar con claridad
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Convertir números complejos en insights comprensibles para cualquier audiencia
        </div>
      </E>
      <ProgressDots current={0} total={3} d={15} />
    </Safe>
  </Fd>
);

const Step2Section:React.FC = () => (
  <Fd dur={120} fi={10} fo={10}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:160,height:160,borderRadius:80,
          background:C.card,border:`2px solid ${C.orange}`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px rgba(251,146,60,0.15)`
        }}>
          <Shield size={80} color={C.orange} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:36,fontWeight:700,color:C.orange,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          Defender decisiones
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Usar datos como respaldo sólido para justificar estrategias y cambios
        </div>
      </E>
      <ProgressDots current={1} total={3} d={15} />
    </Safe>
  </Fd>
);

const Step3Section:React.FC = () => (
  <Fd dur={138} fi={10} fo={1}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:160,height:160,borderRadius:80,
          background:C.card,border:`2px solid ${C.purple}`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px rgba(167,139,250,0.15)`
        }}>
          <Search size={80} color={C.purple} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:36,fontWeight:700,color:C.purple,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          Detectar huecos
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Identificar exactamente dónde está el problema en tu funnel de conversión
        </div>
      </E>
      <ProgressDots current={2} total={3} d={15} />
    </Safe>
  </Fd>
);

export const M2Steps062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Step1Section />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Step2Section />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
          <Step3Section />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};