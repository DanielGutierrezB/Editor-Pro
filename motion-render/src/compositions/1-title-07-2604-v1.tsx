import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, getInputProps} from 'remotion';
import { TrendingUp, Target, ArrowRight, Zap } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

const _static = (getInputProps() as any).staticPreview === true;

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
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const Section1:React.FC = () => (
  <Fd dur={125} fi={10} fo={10}>
    <Safe style={{gap:20}}>
      <E d={0} from="pop">
        <div style={{fontSize:18, fontWeight:700, color:C.dim, textTransform:'uppercase', letterSpacing:3, fontFamily:"'DM Sans',sans-serif"}}>Clase Anterior</div>
      </E>
      <E d={15} from="pop">
        <div style={{width:100, height:100, borderRadius:50, background:C.card, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <TrendingUp size={50} color={C.accent} strokeWidth={1.5} />
        </div>
      </E>
      <E d={30} from="pop">
        <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Leer Datos con Criterio</div>
      </E>
      <E d={45} from="pop">
        <div style={{width:50, height:2, background:C.accent, borderRadius:1}} />
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={95} fi={10} fo={10}>
    <Safe style={{gap:30}}>
      <E d={0} from="left" style={{display:'flex', alignItems:'center', gap:15}}>
        <div style={{width:12, height:12, borderRadius:6, background:C.accent}} />
        <div style={{fontSize:28, fontWeight:400, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>¿Dónde está el hueco? En el funnel</div>
      </E>
      <E d={15} from="left" style={{display:'flex', alignItems:'center', gap:15}}>
        <div style={{width:12, height:12, borderRadius:6, background:C.orange}} />
        <div style={{fontSize:28, fontWeight:400, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>¿Sabes explicar qué está pasando?</div>
      </E>
      <E d={30} from="left" style={{display:'flex', alignItems:'center', gap:15}}>
        <div style={{width:12, height:12, borderRadius:6, background:C.purple}} />
        <div style={{fontSize:28, fontWeight:400, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Sabes defender una decisión</div>
      </E>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={173} fi={10} fo={1}>
    <Safe style={{gap:40}}>
      <E d={0} from="pop">
        <div style={{fontSize:20, fontWeight:700, color:C.accent, textTransform:'uppercase', letterSpacing:3, fontFamily:"'DM Sans',sans-serif"}}>Lo Más Importante</div>
      </E>
      <E d={15} from="pop">
        <div style={{width:140, height:140, borderRadius:70, background:C.card, border:`2px solid ${C.accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.glow}`}}>
          <Target size={70} color={C.accent} strokeWidth={1.5} />
        </div>
      </E>
      <E d={30} from="pop">
        <div style={{fontSize:64, fontWeight:700, color:C.text, textAlign:'center', lineHeight:1.1, fontFamily:"'DM Sans',sans-serif"}}>De Datos a Acción</div>
      </E>
      <E d={45} from="pop">
        <div style={{fontSize:26, fontWeight:400, color:C.dim, textAlign:'center', maxWidth:700, lineHeight:1.4, fontFamily:"'DM Sans',sans-serif"}}>¿Qué haces con esta información?</div>
      </E>
      <E d={60} from="pop">
        <div style={{display:'flex', alignItems:'center', gap:20}}>
          <div style={{width:60, height:2, background:C.accent, borderRadius:1}} />
          <Zap size={32} color={C.accent} strokeWidth={2} />
          <div style={{width:60, height:2, background:C.accent, borderRadius:1}} />
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M1Title072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={125}>
          <Section1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={95}>
          <Section2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={173}>
          <Section3 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};