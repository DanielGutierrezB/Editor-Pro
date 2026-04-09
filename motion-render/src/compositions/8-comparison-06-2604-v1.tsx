import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { X, CheckCircle, TrendingDown, Target, ArrowRight } from 'lucide-react';
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

const ErrorCard:React.FC<{title:string;problem:string;action:string;accent:string;d:number}> = ({title,problem,action,accent,d}) => (
  <E d={d} from="left" style={{flex:1, maxWidth:580}}>
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, height:320}}>
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
        <X size={48} color={C.red} strokeWidth={2} />
        <div style={{fontSize:28, fontWeight:700, color:accent, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:18, color:C.text, fontWeight:600, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>Problema detectado:</div>
        <div style={{fontSize:16, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>{problem}</div>
      </div>
      <div>
        <div style={{fontSize:18, color:C.text, fontWeight:600, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>Acción tomada:</div>
        <div style={{fontSize:16, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>{action}</div>
      </div>
    </div>
  </E>
);

const CorrectCard:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="pop" style={{maxWidth:720}}>
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.green}33`, padding:32, boxShadow:`0 0 24px ${C.green}22`}}>
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
        <CheckCircle size={48} color={C.green} strokeWidth={2} />
        <div style={{fontSize:28, fontWeight:700, color:C.green, fontFamily:"'DM Sans',sans-serif"}}>Enfoque Correcto</div>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:20, justifyContent:'center'}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <TrendingDown size={40} color={C.accent} strokeWidth={1.5} />
          <div style={{fontSize:16, color:C.text, fontWeight:600, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Los datos<br/>señalan</div>
        </div>
        <ArrowRight size={32} color={C.dim} strokeWidth={2} />
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <Target size={40} color={C.accent} strokeWidth={1.5} />
          <div style={{fontSize:16, color:C.text, fontWeight:600, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Acción<br/>específica</div>
        </div>
      </div>
    </div>
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={90} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:50, justifyContent:'center'}}>
      <ErrorCard 
        title="Error Común #1"
        problem="Landing page con baja conversión"
        action="Cambiar el creativo publicitario"
        accent={C.orange}
        d={0}
      />
      <ErrorCard 
        title="Error Común #2"
        problem="Creativo publicitario inefectivo"
        action="Reducir el presupuesto de campaña"
        accent={C.purple}
        d={15}
      />
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={90} fi={10} fo={1}>
    <Safe>
      <E d={0} from="up" style={{marginBottom:40}}>
        <div style={{fontSize:32, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Los datos te dicen dónde está el problema
        </div>
      </E>
      <CorrectCard d={20} />
    </Safe>
  </Fd>
);

export const M8Comparison062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <Section1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={249}>
          <Section2 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};