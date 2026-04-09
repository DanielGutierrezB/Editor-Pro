import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { TrendingUp, AlertTriangle, DollarSign, ArrowRight, Target, BarChart3 } from 'lucide-react';
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

const DiagnosticCard:React.FC<{icon:React.ReactNode; title:string; desc:string; accentColor:string; d:number}> = ({icon,title,desc,accentColor,d}) => (
  <E d={d} from="left" style={{flex:1, maxWidth:500}}>
    <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:280}}>
      <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
        <div style={{width:60, height:60, borderRadius:30, background:`${accentColor}15`, display:'flex', alignItems:'center', justifyContent:'center', border:`1px solid ${accentColor}33`}}>
          {icon}
        </div>
        <div style={{fontSize:28, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>{title}</div>
      </div>
      <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>{desc}</div>
      <div style={{marginTop:24, display:'flex', flexDirection:'column', gap:8}}>
        <div style={{height:4, background:C.dim, borderRadius:2, opacity:0.3, width:'100%'}} />
        <div style={{height:4, background:C.dim, borderRadius:2, opacity:0.25, width:'85%'}} />
        <div style={{height:4, background:C.dim, borderRadius:2, opacity:0.2, width:'70%'}} />
      </div>
    </div>
  </E>
);

const Arrow:React.FC<{d:number}> = ({d}) => (
  <E d={d} from="pop" style={{alignSelf:'center', margin:'0 20px'}}>
    <ArrowRight size={40} color={C.accent} strokeWidth={2} />
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Diagnóstico del Funnel
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', maxWidth:800, fontFamily:"'DM Sans',sans-serif"}}>
          Cuando todo convierte pero el CPA está alto
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={200} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:30, justifyContent:'center', alignItems:'stretch'}}>
      <DiagnosticCard 
        icon={<TrendingUp size={32} color={C.accent} strokeWidth={2} />}
        title="Todo Convierte"
        desc="Las conversiones están funcionando correctamente en cada etapa del funnel"
        accentColor={C.accent}
        d={0}
      />
      <Arrow d={15} />
      <DiagnosticCard 
        icon={<AlertTriangle size={32} color={C.red} strokeWidth={2} />}
        title="CPA Alto"
        desc="El costo por adquisición supera el objetivo establecido para la campaña"
        accentColor={C.red}
        d={30}
      />
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.orange, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          El Problema: Modelo de Negocio
        </div>
      </E>
      <E d={15} from="up">
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`, maxWidth:900}}>
          <div style={{display:'flex', alignItems:'center', gap:20, marginBottom:24}}>
            <DollarSign size={48} color={C.orange} strokeWidth={2} />
            <div style={{fontSize:28, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
              Precio vs Costo de Adquisición
            </div>
          </div>
          <div style={{fontSize:20, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
            El precio de venta no soporta el costo de adquisición del cliente
          </div>
          <div style={{marginTop:32, display:'flex', flexDirection:'column', gap:10}}>
            <div style={{height:4, background:C.orange, borderRadius:2, opacity:0.4, width:'100%'}} />
            <div style={{height:4, background:C.orange, borderRadius:2, opacity:0.3, width:'90%'}} />
            <div style={{height:4, background:C.orange, borderRadius:2, opacity:0.25, width:'75%'}} />
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={247} fi={10} fo={1}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:40, fontWeight:700, color:C.purple, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Lectura con Criterio
        </div>
      </E>
      <E d={15} from="up">
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`, maxWidth:1000}}>
          <div style={{display:'flex', alignItems:'center', gap:20, marginBottom:32}}>
            <Target size={48} color={C.purple} strokeWidth={2} />
            <div style={{fontSize:32, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
              Metodología Correcta
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:24}}>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.purple}} />
              <div style={{fontSize:22, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                No mires el número en aislamiento
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.purple}} />
              <div style={{fontSize:22, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                Analiza dentro del funnel completo
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.purple}} />
              <div style={{fontSize:22, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                Pregunta dónde se rompe exactamente
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.purple}} />
              <div style={{fontSize:22, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                Actúa exactamente ahí
              </div>
            </div>
          </div>
        </div>
      </E>
      <E d={45} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', fontStyle:'italic', fontFamily:"'DM Sans',sans-serif"}}>
          Ese es el error más común
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M7Cards062604V2:React.FC = () => {
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
        <TransitionSeries.Sequence durationInFrames={200}>
          <Section2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
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