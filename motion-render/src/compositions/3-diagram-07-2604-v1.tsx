import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { GitBranch, Target, DollarSign, TrendingUp, Search, Stethoscope, AlertCircle } from 'lucide-react';
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

const FlowBox:React.FC<{title:string; accent:string; icon:React.ReactNode; d:number; width?:number}> = ({title,accent,icon,d,width=520}) => (
  <E d={d} from="up">
    <div style={{width, background:C.card, borderRadius:12, border:`2px solid ${accent}`, padding:24, boxShadow:`0 8px 24px ${accent}33`, display:'flex', alignItems:'center', gap:16}}>
      <div style={{width:60, height:60, borderRadius:30, background:accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
        {icon}
      </div>
      <div style={{fontSize:28, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
    </div>
  </E>
);

const DecisionBranch:React.FC<{title:string; desc:string; accent:string; icon:React.ReactNode; d:number; isActive?:boolean}> = ({title,desc,accent,icon,d,isActive=false}) => (
  <E d={d} from="pop">
    <div style={{width:480, background:C.card, borderRadius:12, border:`2px solid ${isActive ? accent : C.border}`, padding:24, boxShadow:isActive ? `0 8px 24px ${accent}33` : `0 8px 24px ${C.glow}`, display:'flex', flexDirection:'column', alignItems:'center', gap:16, opacity:isActive ? 1 : 0.6}}>
      <div style={{width:80, height:80, borderRadius:40, background:isActive ? accent : C.dim, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.3s ease'}}>
        {icon}
      </div>
      <div style={{fontSize:24, fontWeight:700, color:isActive ? accent : C.text, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>{title}</div>
      <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif", textAlign:'center', lineHeight:1.4}}>{desc}</div>
    </div>
  </E>
);

const Arrow:React.FC<{d:number; direction?:'down'|'diagonal'}> = ({d,direction='down'}) => (
  <E d={d} from="pop">
    <svg width={direction === 'diagonal' ? 80 : 40} height={direction === 'diagonal' ? 80 : 60} style={{opacity:0.7}}>
      {direction === 'down' ? (
        <path d="M20 10 L20 40 M10 30 L20 40 L30 30" stroke={C.accent} strokeWidth={3} strokeLinecap="round" fill="none"/>
      ) : (
        <path d="M10 10 L60 60 M50 50 L60 60 L50 70" stroke={C.accent} strokeWidth={3} strokeLinecap="round" fill="none"/>
      )}
    </svg>
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={120} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
          Tres Escenarios en Meta
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24, color:C.dim, fontFamily:"'DM Sans',sans-serif", textAlign:'center', maxWidth:800}}>
          Todo lo que pasa en Meta cae en estos tres casos
        </div>
      </E>
      <FlowBox title="Análisis de Decisiones" accent={C.accent} icon={<GitBranch size={32} color={C.bg} />} d={30} />
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{gap:30}}>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
          Los Tres Escenarios
        </div>
      </E>
      <div style={{display:'flex', flexDirection:'row', gap:40, justifyContent:'center', alignItems:'flex-start', marginTop:20}}>
        <DecisionBranch 
          title="No Gasta" 
          desc="El presupuesto no se consume"
          accent={C.red} 
          icon={<AlertCircle size={40} color={C.bg} />} 
          d={15}
          isActive={true}
        />
        <DecisionBranch 
          title="Gasta sin Convertir" 
          desc="Se consume presupuesto pero sin resultados"
          accent={C.orange} 
          icon={<DollarSign size={40} color={C.bg} />} 
          d={30}
          isActive={false}
        />
        <DecisionBranch 
          title="Convierte pero Caro" 
          desc="Hay conversiones pero el costo es alto"
          accent={C.purple} 
          icon={<TrendingUp size={40} color={C.bg} />} 
          d={45}
          isActive={false}
        />
      </div>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{gap:30}}>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
          Gasta sin Convertir
        </div>
      </E>
      <div style={{display:'flex', flexDirection:'row', gap:40, justifyContent:'center', alignItems:'flex-start', marginTop:20}}>
        <DecisionBranch 
          title="No Gasta" 
          desc="El presupuesto no se consume"
          accent={C.red} 
          icon={<AlertCircle size={40} color={C.bg} />} 
          d={0}
          isActive={false}
        />
        <DecisionBranch 
          title="Gasta sin Convertir" 
          desc="Se consume presupuesto pero sin resultados"
          accent={C.orange} 
          icon={<DollarSign size={40} color={C.bg} />} 
          d={0}
          isActive={true}
        />
        <DecisionBranch 
          title="Convierte pero Caro" 
          desc="Hay conversiones pero el costo es alto"
          accent={C.purple} 
          icon={<TrendingUp size={40} color={C.bg} />} 
          d={0}
          isActive={false}
        />
      </div>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={120} fi={10} fo={1}>
    <Safe style={{gap:60}}>
      <E d={0} from="up">
        <div style={{fontSize:42, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
          De Adivinar a Diagnosticar
        </div>
      </E>
      <div style={{display:'flex', flexDirection:'row', gap:80, justifyContent:'center', alignItems:'center'}}>
        <E d={15} from="left">
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
            <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.red}`, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.6}}>
              <Search size={60} color={C.red} />
            </div>
            <div style={{fontSize:28, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>Adivinar</div>
          </div>
        </E>
        <Arrow d={30} direction="diagonal" />
        <E d={45} from="right">
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
            <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.accent}33`}}>
              <Stethoscope size={60} color={C.accent} />
            </div>
            <div style={{fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Diagnosticar</div>
          </div>
        </E>
      </div>
    </Safe>
  </Fd>
);

export const M3Diagram072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
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
        <TransitionSeries.Sequence durationInFrames={150}>
          <Section3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Section4 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};