import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { Search, Target, DollarSign, Users } from 'lucide-react';
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

const StepView:React.FC<{step:number; total:number; icon:React.ReactNode; title:string; desc:string; accent:string; d:number}> = ({step,total,icon,title,desc,accent,d}) => (
  <Safe style={{flexDirection:'row', gap:80}}>
    <E d={d} from="left" style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:24}}>
      <div style={{width:160, height:160, borderRadius:80, background:C.card, border:`2px solid ${accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${accent}22`}}>
        {icon}
      </div>
      <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      <div style={{fontSize:20, color:C.dim, textAlign:'center', maxWidth:600, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>{desc}</div>
    </E>
    <E d={d+12} from="right" style={{display:'flex', flexDirection:'column', gap:20, justifyContent:'center'}}>
      {Array.from({length:total}).map((_,i) => (
        <div key={i} style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{width:16, height:16, borderRadius:8, background: i < step ? C.dim : i === step ? accent : 'transparent', border: i === step ? `2px solid ${accent}` : `1px solid ${C.dim}`}} />
          <span style={{fontSize:16, color: i === step ? C.text : C.dim, fontWeight: i === step ? 700 : 400, fontFamily:"'DM Sans',sans-serif"}}>Paso {i+1}</span>
        </div>
      ))}
    </E>
  </Safe>
);

const Section1:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <StepView 
      step={0} 
      total={3} 
      icon={<Search size={80} color={C.red} strokeWidth={1.5} />}
      title="Meta no encuentra oportunidades"
      desc="Cuando las campañas no gastan, significa que la plataforma no puede identificar suficientes usuarios objetivo"
      accent={C.red}
      d={0}
    />
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={160} fi={10} fo={10}>
    <StepView 
      step={1} 
      total={3} 
      icon={<Target size={80} color={C.orange} strokeWidth={1.5} />}
      title="Revisar señal y restricciones"
      desc="Es necesario analizar la calidad de la señal de conversión y las limitaciones que puedan estar bloqueando el alcance"
      accent={C.orange}
      d={0}
    />
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={296} fi={10} fo={1}>
    <Safe style={{flexDirection:'row', gap:80}}>
      <E d={0} from="left" style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:24}}>
        <div style={{width:160, height:160, borderRadius:80, background:C.card, border:`2px solid ${C.accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.accent}22`}}>
          <DollarSign size={80} color={C.accent} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Dos preguntas clave</div>
        <div style={{display:'flex', flexDirection:'column', gap:20, maxWidth:700}}>
          <E d={30} from="up">
            <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, boxShadow:`0 8px 24px ${C.glow}`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                <DollarSign size={24} color={C.accent} strokeWidth={2} />
                <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>¿El presupuesto es viable?</div>
              </div>
              <div style={{fontSize:16, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>Verificar si el presupuesto diario es suficiente para el objetivo planteado</div>
            </div>
          </E>
          <E d={45} from="up">
            <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, boxShadow:`0 8px 24px ${C.glow}`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                <Users size={24} color={C.purple} strokeWidth={2} />
                <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>¿El público está muy segmentado?</div>
              </div>
              <div style={{fontSize:16, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>Evaluar si las restricciones de audiencia son demasiado específicas</div>
            </div>
          </E>
        </div>
      </E>
      <E d={12} from="right" style={{display:'flex', flexDirection:'column', gap:20, justifyContent:'center'}}>
        {Array.from({length:3}).map((_,i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:16, height:16, borderRadius:8, background: i < 2 ? C.dim : i === 2 ? C.accent : 'transparent', border: i === 2 ? `2px solid ${C.accent}` : `1px solid ${C.dim}`}} />
            <span style={{fontSize:16, color: i === 2 ? C.text : C.dim, fontWeight: i === 2 ? 700 : 400, fontFamily:"'DM Sans',sans-serif"}}>Paso {i+1}</span>
          </div>
        ))}
      </E>
    </Safe>
  </Fd>
);

export const M4Steps072604V1:React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={160}>
          <Section2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={296}>
          <Section3 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};