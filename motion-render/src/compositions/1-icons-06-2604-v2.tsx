import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { Target, DollarSign, TrendingUp, BarChart3 } from 'lucide-react';
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

const IconItem:React.FC<{icon:React.ReactNode; label:string; accent:string; d:number}> = ({icon,label,accent,d}) => (
  <E d={d} from="pop" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
    <div style={{width:200, height:200, borderRadius:100, background:C.card, border:`2px solid ${accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${accent}22`}}>
      {icon}
    </div>
    <div style={{fontSize:24, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>{label}</div>
  </E>
);

const IntroSection:React.FC = () => (
  <Fd dur={75} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
          Métricas Clave
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:20, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          CTR, CPA, ROAS y análisis completo
        </div>
      </E>
    </Safe>
  </Fd>
);

const MetricsSection:React.FC = () => (
  <Fd dur={138} fi={10} fo={1}>
    <Safe style={{flexDirection:'row', gap:150, justifyContent:'center'}}>
      <IconItem 
        icon={<Target size={80} color={C.accent} strokeWidth={2}/>} 
        label="CTR" 
        accent={C.accent} 
        d={0} 
      />
      <IconItem 
        icon={<DollarSign size={80} color={C.orange} strokeWidth={2}/>} 
        label="CPA" 
        accent={C.orange} 
        d={15} 
      />
      <IconItem 
        icon={<TrendingUp size={80} color={C.purple} strokeWidth={2}/>} 
        label="ROAS" 
        accent={C.purple} 
        d={30} 
      />
    </Safe>
  </Fd>
);

export const M1Icons062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={138}>
          <MetricsSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};