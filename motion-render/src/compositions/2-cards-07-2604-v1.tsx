import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { ArrowRight, TreePine, Target, Users, Shield } from 'lucide-react';
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

const IntroSection:React.FC = () => (
  <Fd dur={270} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', marginBottom:24, fontFamily:"'DM Sans',sans-serif"}}>
          Operación Sistemática
        </div>
      </E>
      <E d={15} from="pop">
        <div style={{fontSize:28, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Cuatro partes fundamentales
        </div>
      </E>
    </Safe>
  </Fd>
);

const Card:React.FC<{icon:React.ReactNode; title:string; accent:string; d:number}> = ({icon, title, accent, d}) => (
  <E d={d} from="left" style={{width:340}}>
    <div style={{
      background:C.card,
      borderRadius:12,
      border:`1px solid ${C.border}`,
      padding:24,
      height:200,
      display:'flex',
      flexDirection:'column',
      alignItems:'center',
      justifyContent:'center',
      gap:16,
      boxShadow:`0 8px 24px ${C.glow}`
    }}>
      <div style={{
        width:80,
        height:80,
        borderRadius:40,
        background:accent + '15',
        border:`2px solid ${accent}`,
        display:'flex',
        alignItems:'center',
        justifyContent:'center'
      }}>
        {icon}
      </div>
      <div style={{fontSize:24, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        {title}
      </div>
    </div>
  </E>
);

const Arrow:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="pop" style={{alignSelf:'center'}}>
    <ArrowRight size={32} color={C.dim} />
  </E>
);

const CardsSection:React.FC = () => (
  <Fd dur={342} fi={10} fo={1}>
    <Safe style={{flexDirection:'row', gap:30, justifyContent:'center', alignItems:'center'}}>
      <Card 
        icon={<TreePine size={40} color={C.accent} strokeWidth={2} />}
        title="Árbol de decisiones"
        accent={C.accent}
        d={0}
      />
      <Arrow d={20} />
      <Card 
        icon={<Target size={40} color={C.orange} strokeWidth={2} />}
        title="Diagnóstico fuera de meta"
        accent={C.orange}
        d={40}
      />
      <Arrow d={60} />
      <Card 
        icon={<Users size={40} color={C.purple} strokeWidth={2} />}
        title="Grupo operativo real"
        accent={C.purple}
        d={80}
      />
      <Arrow d={100} />
      <Card 
        icon={<Shield size={40} color={C.red} strokeWidth={2} />}
        title="Cambios seguros"
        accent={C.red}
        d={120}
      />
    </Safe>
  </Fd>
);

export const M2Cards072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={270}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={342}>
          <CardsSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};