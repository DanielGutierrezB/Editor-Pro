import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { AlertTriangle, TrendingDown, DollarSign, ArrowRight, BarChart3 } from 'lucide-react';
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

const DiagnosticCard:React.FC<{title:string; problem:string; icon:React.ReactNode; accent:string; d:number}> = ({title,problem,icon,accent,d}) => (
  <E d={d} from="left" style={{width:500, maxWidth:500}}>
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:280, display:'flex', flexDirection:'column'}}>
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
        <div style={{width:60, height:60, borderRadius:30, background:`${accent}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${accent}33`}}>
          {icon}
        </div>
        <div style={{fontSize:28, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      </div>
      <div style={{fontSize:20, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif", flex:1}}>
        {problem}
      </div>
      <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:16}}>
        <div style={{height:4, background:C.dim, opacity:0.3, borderRadius:2, width:'100%'}}></div>
        <div style={{height:4, background:C.dim, opacity:0.2, borderRadius:2, width:'75%'}}></div>
        <div style={{height:4, background:C.dim, opacity:0.1, borderRadius:2, width:'60%'}}></div>
      </div>
    </div>
  </E>
);

const ConnectorArrow:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="pop" style={{display:'flex', alignItems:'center', justifyContent:'center', margin:'0 20px'}}>
    <ArrowRight size={40} color={C.accent} strokeWidth={2} />
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:40, justifyContent:'center', alignItems:'center'}}>
      <DiagnosticCard 
        title="Todo Convierte"
        problem="Pero el CPA está por encima del objetivo"
        icon={<TrendingDown size={32} color={C.orange} strokeWidth={2} />}
        accent={C.orange}
        d={0}
      />
      <ConnectorArrow d={15} />
      <DiagnosticCard 
        title="Problema Identificado"
        problem="El hueco puede estar en el modelo de negocio"
        icon={<AlertTriangle size={32} color={C.red} strokeWidth={2} />}
        accent={C.red}
        d={30}
      />
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'column', gap:50}}>
      <E d={0} from="up">
        <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Análisis del Modelo
        </div>
      </E>
      <Safe style={{flexDirection:'row', gap:30, justifyContent:'center'}}>
        <E d={15} from="left" style={{width:480}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:28, boxShadow:`0 8px 24px ${C.glow}`}}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
              <DollarSign size={36} color={C.accent} strokeWidth={2} />
              <div style={{fontSize:24, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Precio de Venta</div>
            </div>
            <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>No soporta el costo de adquisición</div>
          </div>
        </E>
        <E d={25} from="pop" style={{alignSelf:'center'}}>
          <div style={{fontSize:32, color:C.red, fontWeight:700}}>≠</div>
        </E>
        <E d={35} from="right" style={{width:480}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:28, boxShadow:`0 8px 24px ${C.glow}`}}>
            <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:20}}>
              <BarChart3 size={36} color={C.orange} strokeWidth={2} />
              <div style={{fontSize:24, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Costo de Adquisición</div>
            </div>
            <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>Muy alto para ser rentable</div>
          </div>
        </E>
      </Safe>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={200} fi={10} fo={10}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Lectura con Criterio
        </div>
      </E>
      <E d={20} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif", maxWidth:800}}>
          No mira el número en aislamiento
        </div>
      </E>
      <Safe style={{flexDirection:'row', gap:50, justifyContent:'center', marginTop:20}}>
        <E d={40} from="left" style={{textAlign:'center'}}>
          <div style={{width:200, height:200, borderRadius:100, background:C.card, border:`2px solid ${C.accent}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.accent}33`}}>
            <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Mira dentro</div>
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>del funnel</div>
          </div>
        </E>
        <E d={55} from="pop" style={{textAlign:'center'}}>
          <div style={{width:200, height:200, borderRadius:100, background:C.card, border:`2px solid ${C.orange}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.orange}33`}}>
            <div style={{fontSize:32, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Pregunta</div>
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>dónde se rompe</div>
          </div>
        </E>
        <E d={70} from="right" style={{textAlign:'center'}}>
          <div style={{width:200, height:200, borderRadius:100, background:C.card, border:`2px solid ${C.green}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.green}33`}}>
            <div style={{fontSize:32, fontWeight:700, color:C.green, fontFamily:"'DM Sans',sans-serif"}}>Actúa</div>
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>exactamente ahí</div>
          </div>
        </E>
      </Safe>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={247} fi={10} fo={1}>
    <Safe style={{flexDirection:'column', gap:30, justifyContent:'center'}}>
      <E d={0} from="up">
        <div style={{fontSize:52, fontWeight:700, color:C.red, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Error Más Común
        </div>
      </E>
      <E d={20} from="up">
        <div style={{background:C.card, borderRadius:16, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`, maxWidth:1000}}>
          <div style={{fontSize:28, color:C.text, textAlign:'center', lineHeight:1.4, fontFamily:"'DM Sans',sans-serif"}}>
            Mirar números aislados en lugar de analizarlos dentro del contexto completo del funnel
          </div>
        </div>
      </E>
      <E d={40} from="up">
        <div style={{fontSize:22, color:C.accent, textAlign:'center', fontWeight:700, fontFamily:"'DM Sans',sans-serif"}}>
          Ese es el error más común
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M7Cards062604V1:React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={200}>
          <Section3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={247}>
          <Section4 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};