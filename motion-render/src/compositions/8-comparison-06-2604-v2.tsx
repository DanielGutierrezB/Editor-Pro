import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { X, CheckCircle, TrendingDown, Target, BarChart3, ArrowRight } from 'lucide-react';
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

const ErrorCard:React.FC<{title:string; problem:string; wrongAction:string; d:number; from:string}> = ({title,problem,wrongAction,d,from}) => (
  <E d={d} from={from} style={{flex:1, maxWidth:520}}>
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:28, boxShadow:`0 8px 24px ${C.glow}`, height:280}}>
      <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
        <X size={32} color={C.red} strokeWidth={2.5} />
        <div style={{fontSize:24, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:16, color:C.dim, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>Problema detectado:</div>
        <div style={{fontSize:18, color:C.text, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>{problem}</div>
      </div>
      <div>
        <div style={{fontSize:16, color:C.dim, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>Acción incorrecta:</div>
        <div style={{fontSize:18, color:C.red, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>{wrongAction}</div>
      </div>
    </div>
  </E>
);

const CorrectCard:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="up" style={{maxWidth:700}}>
    <div style={{background:C.card, borderRadius:12, border:`2px solid ${C.accent}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, textAlign:'center'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:24}}>
        <CheckCircle size={40} color={C.accent} strokeWidth={2.5} />
        <div style={{fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Acción Correcta</div>
      </div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:20}}>
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <BarChart3 size={32} color={C.text} />
          <div style={{fontSize:16, color:C.text, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>Los datos</div>
        </div>
        <ArrowRight size={24} color={C.dim} />
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <Target size={32} color={C.accent} />
          <div style={{fontSize:16, color:C.text, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>Problema específico</div>
        </div>
        <ArrowRight size={24} color={C.dim} />
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <CheckCircle size={32} color={C.accent} />
          <div style={{fontSize:16, color:C.text, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>Acción específica</div>
        </div>
      </div>
      <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Los datos te dicen dónde está el problema</div>
      <div style={{fontSize:18, color:C.text, fontWeight:700, marginTop:8, fontFamily:"'DM Sans',sans-serif"}}>y tú actúas exactamente ahí</div>
    </div>
  </E>
);

const ErrorSection:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:50, alignItems:'center'}}>
      <ErrorCard 
        title="Error Común #1"
        problem="Landing page con baja conversión"
        wrongAction="Cambiar el creativo"
        d={0}
        from="left"
      />
      <E d={10} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.red, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
      </E>
      <ErrorCard 
        title="Error Común #2"
        problem="Creativo con bajo rendimiento"
        wrongAction="Bajar el presupuesto"
        d={15}
        from="right"
      />
    </Safe>
  </Fd>
);

const CorrectSection:React.FC = () => (
  <Fd dur={159} fi={10} fo={1}>
    <Safe>
      <CorrectCard d={0} />
    </Safe>
  </Fd>
);

export const M8Comparison062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={180}>
          <ErrorSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={159}>
          <CorrectSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};