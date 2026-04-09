import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { ArrowRight, AlertTriangle, MousePointer, Eye, ShoppingCart } from 'lucide-react';
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

const FunnelBox:React.FC<{icon:React.ReactNode; title:string; subtitle:string; accent:string; d:number}> = ({icon,title,subtitle,accent,d}) => (
  <E d={d} from="pop" style={{width:520, padding:32, background:C.card, borderRadius:12, border:`2px solid ${accent}`, boxShadow:`0 8px 24px ${accent}22`, display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
    <div style={{width:80, height:80, borderRadius:40, background:accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
      {icon}
    </div>
    <div style={{fontSize:28, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
    <div style={{fontSize:18, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>{subtitle}</div>
  </E>
);

const Arrow:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="pop" style={{margin:'20px 0'}}>
    <ArrowRight size={40} color={C.dim} strokeWidth={2} />
  </E>
);

const ProblemCard:React.FC<{title:string; description:string; accent:string; d:number; from?:string}> = ({title,description,accent,d,from='left'}) => (
  <E d={d} from={from} style={{width:480, padding:24, background:C.card, borderRadius:12, border:`1px solid ${accent}33`, boxShadow:`0 4px 16px ${accent}15`}}>
    <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
      <AlertTriangle size={24} color={accent} strokeWidth={2} />
      <div style={{fontSize:20, fontWeight:700, color:accent, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
    </div>
    <div style={{fontSize:16, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>{description}</div>
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={270} fi={10} fo={12}>
    <Safe style={{gap:20}}>
      <E d={0} from="up">
        <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', marginBottom:30, fontFamily:"'DM Sans',sans-serif"}}>
          Los 3 Tramos del Funnel
        </div>
      </E>
      <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:30}}>
        <FunnelBox 
          icon={<Eye size={40} color={C.bg} strokeWidth={2} />}
          title="Impresión → Clic"
          subtitle="CTR (Click Through Rate)"
          accent={C.accent}
          d={15}
        />
        <Arrow d={45} />
        <FunnelBox 
          icon={<MousePointer size={40} color={C.bg} strokeWidth={2} />}
          title="Clic → Visita"
          subtitle="Tráfico a la landing"
          accent={C.orange}
          d={60}
        />
        <Arrow d={90} />
        <FunnelBox 
          icon={<ShoppingCart size={40} color={C.bg} strokeWidth={2} />}
          title="Visita → Conversión"
          subtitle="Tasa de conversión"
          accent={C.purple}
          d={105}
        />
      </div>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={360} fi={10} fo={12}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Detectar Huecos en el Funnel
        </div>
      </E>
      <E d={20} from="up">
        <div style={{fontSize:20, color:C.dim, textAlign:'center', maxWidth:800, fontFamily:"'DM Sans',sans-serif"}}>
          Los datos te dicen exactamente dónde está el problema
        </div>
      </E>
      <div style={{display:'flex', gap:50, justifyContent:'center', marginTop:40}}>
        <ProblemCard 
          title="CTR Bajo"
          description="El anuncio no está enganchando. Problema de creativo o ángulo."
          accent={C.red}
          d={60}
          from="left"
        />
        <ProblemCard 
          title="Conversión Baja"
          description="No es el anuncio, es lo que pasa después del clic: landing, precio, oferta o checkout."
          accent={C.orange}
          d={75}
          from="right"
        />
      </div>
    </Safe>
  </Fd>
);

export const M6Diagram062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={270}>
          <Section1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={360}>
          <Section2 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};