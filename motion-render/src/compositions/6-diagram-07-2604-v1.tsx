import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, getInputProps} from 'remotion';
import { TrendingUp, TrendingDown, AlertTriangle, Eye, DollarSign, MousePointer, ArrowDown } from 'lucide-react';
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

const FlowBox:React.FC<{title:string; icon:React.ReactNode; color:string; width?:number}> = ({title,icon,color,width=520}) => (
  <div style={{
    width,
    background:C.card,
    borderRadius:12,
    border:`2px solid ${color}`,
    padding:24,
    display:'flex',
    flexDirection:'column',
    alignItems:'center',
    gap:16,
    boxShadow:`0 8px 24px ${color}22`,
    fontFamily:"'DM Sans',sans-serif"
  }}>
    <div style={{color}}>{icon}</div>
    <div style={{fontSize:24,fontWeight:700,color:C.text,textAlign:'center'}}>{title}</div>
  </div>
);

const Arrow:React.FC<{color:string}> = ({color}) => (
  <ArrowDown size={40} color={color} strokeWidth={2} style={{margin:'20px 0'}} />
);

const DiamondBox:React.FC<{title:string; color:string}> = ({title,color}) => (
  <div style={{
    width:200,
    height:200,
    background:C.card,
    border:`2px solid ${color}`,
    transform:'rotate(45deg)',
    display:'flex',
    alignItems:'center',
    justifyContent:'center',
    boxShadow:`0 8px 24px ${color}22`,
    fontFamily:"'DM Sans',sans-serif"
  }}>
    <div style={{
      transform:'rotate(-45deg)',
      fontSize:18,
      fontWeight:700,
      color:C.text,
      textAlign:'center',
      lineHeight:1.2
    }}>
      {title}
    </div>
  </div>
);

const Section1:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{gap:30}}>
      <E d={0} from="up">
        <FlowBox 
          title="CTR Alto pero Conversión Baja"
          icon={<TrendingUp size={60} />}
          color={C.accent}
          width={600}
        />
      </E>
      <E d={15} from="pop">
        <Arrow color={C.accent} />
      </E>
      <E d={30} from="up">
        <div style={{
          fontSize:28,
          fontWeight:700,
          color:C.text,
          textAlign:'center',
          fontFamily:"'DM Sans',sans-serif"
        }}>
          META hace su trabajo, pero algo falla después del clic
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{
          fontSize:36,
          fontWeight:700,
          color:C.accent,
          textAlign:'center',
          fontFamily:"'DM Sans',sans-serif"
        }}>
          Posibles Causas
        </div>
      </E>
      <E d={15} from="pop">
        <DiamondBox title="¿Qué está fallando?" color={C.orange} />
      </E>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={240} fi={10} fo={10}>
    <Safe style={{gap:30, flexDirection:'row', flexWrap:'wrap', justifyContent:'center'}}>
      <E d={0} from="left">
        <FlowBox 
          title="Oferta poco clara o poco atractiva"
          icon={<Eye size={50} />}
          color={C.red}
          width={480}
        />
      </E>
      <E d={15} from="right">
        <FlowBox 
          title="Landing confusa, lenta o sin CTA claro"
          icon={<MousePointer size={50} />}
          color={C.orange}
          width={480}
        />
      </E>
      <E d={30} from="left">
        <FlowBox 
          title="Precio que el mercado no acepta"
          icon={<DollarSign size={50} />}
          color={C.purple}
          width={480}
        />
      </E>
      <E d={45} from="right">
        <FlowBox 
          title="UX con fricción técnica en compra"
          icon={<AlertTriangle size={50} />}
          color={C.red}
          width={480}
        />
      </E>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{
          fontSize:32,
          fontWeight:700,
          color:C.accent,
          textAlign:'center',
          fontFamily:"'DM Sans',sans-serif"
        }}>
          Diagnóstico: Problema post-clic
        </div>
      </E>
      <E d={15} from="pop">
        <div style={{
          fontSize:24,
          fontWeight:400,
          color:C.dim,
          textAlign:'center',
          maxWidth:800,
          lineHeight:1.6,
          fontFamily:"'DM Sans',sans-serif"
        }}>
          El tráfico llega interesado, pero la experiencia después del clic no convierte
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section5:React.FC = () => (
  <Fd dur={258} fi={10} fo={1}>
    <Safe style={{gap:50}}>
      <E d={0} from="up">
        <div style={{
          fontSize:40,
          fontWeight:700,
          color:C.accent,
          textAlign:'center',
          fontFamily:"'DM Sans',sans-serif"
        }}>
          Solución
        </div>
      </E>
      <E d={20} from="pop">
        <div style={{
          background:C.card,
          borderRadius:12,
          border:`2px solid ${C.green}`,
          padding:32,
          maxWidth:900,
          boxShadow:`0 8px 24px ${C.glow}`,
          fontFamily:"'DM Sans',sans-serif"
        }}>
          <div style={{
            fontSize:26,
            fontWeight:700,
            color:C.text,
            textAlign:'center',
            marginBottom:20
          }}>
            Optimizar la experiencia post-clic
          </div>
          <div style={{
            fontSize:20,
            fontWeight:400,
            color:C.dim,
            textAlign:'center',
            lineHeight:1.6
          }}>
            Revisar oferta, landing page, precio y proceso de compra
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M6Diagram072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={150}>
          <Section1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <Section2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={240}>
          <Section3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <Section4 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={258}>
          <Section5 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};