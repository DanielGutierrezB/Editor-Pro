import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { CheckCircle, ArrowRight, Target, Zap, Settings, TrendingUp } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { evolvePath } from '@remotion/paths';

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

const DrawPath:React.FC<{path:string;d:number;color:string;strokeWidth:number}> = ({path,d,color,strokeWidth}) => {
  const frame = useCurrentFrame();
  const progress = spring({frame:frame-d,fps:30,config:{damping:16,mass:0.5}});
  const evolution = evolvePath(progress, path);
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" style={{position:'absolute',inset:0}}>
      <path
        d={path}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={evolution.strokeDasharray}
        strokeDashoffset={evolution.strokeDashoffset}
      />
    </svg>
  );
};

// Sección 1: Diferenciación con 4 pasos + evitar 5 errores
const DifferentiationSection:React.FC = () => (
  <Safe style={{gap:40}}>
    <E d={0} from="up">
      <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Diferenciación Completa
      </div>
    </E>
    <E d={15} from="left" style={{display:'flex', flexDirection:'row', gap:60, alignItems:'center'}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, display:'flex', flexDirection:'column', alignItems:'center', gap:16, minWidth:300}}>
        <Target size={80} color={C.accent} strokeWidth={1.5} />
        <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>4</div>
        <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Pasos</div>
        <div style={{fontSize:16, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Estructura clara</div>
      </div>
      <E d={30} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <span style={{fontSize:24, fontWeight:700, color:C.bg, fontFamily:"'DM Sans',sans-serif"}}>+</span>
        </div>
      </E>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, display:'flex', flexDirection:'column', alignItems:'center', gap:16, minWidth:300}}>
        <CheckCircle size={80} color={C.red} strokeWidth={1.5} />
        <div style={{fontSize:32, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>5</div>
        <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Errores</div>
        <div style={{fontSize:16, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Evitar completamente</div>
      </div>
    </E>
    <E d={45} from="up">
      <div style={{fontSize:24, color:C.accent, fontWeight:700, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        = Muy poca gente hace esto bien
      </div>
    </E>
  </Safe>
);

// Sección 2: Preview de la siguiente clase - Árbol de decisión
const DecisionTreeSection:React.FC = () => (
  <Safe style={{gap:30}}>
    <E d={0} from="up">
      <div style={{fontSize:42, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Siguiente Clase
      </div>
    </E>
    <E d={15} from="left" style={{position:'relative', width:500, height:300}}>
      <DrawPath 
        path="M50 50 L200 50 L200 150 M200 100 L350 100 M200 100 L350 200"
        d={0}
        color={C.accent}
        strokeWidth={3}
      />
      <E d={20} from="pop" style={{position:'absolute', left:30, top:30}}>
        <div style={{width:40, height:40, borderRadius:20, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <Settings size={24} color={C.bg} />
        </div>
      </E>
      <E d={35} from="pop" style={{position:'absolute', left:330, top:80}}>
        <div style={{width:40, height:40, borderRadius:20, background:C.orange, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <CheckCircle size={24} color={C.bg} />
        </div>
      </E>
      <E d={50} from="pop" style={{position:'absolute', left:330, top:180}}>
        <div style={{width:40, height:40, borderRadius:20, background:C.purple, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <TrendingUp size={24} color={C.bg} />
        </div>
      </E>
    </E>
    <E d={65} from="up">
      <div style={{fontSize:28, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Árbol de Decisión Real
      </div>
    </E>
  </Safe>
);

// Sección 3: SOP Operativo
const SOPSection:React.FC = () => (
  <Safe style={{flexDirection:'row', gap:80, alignItems:'center'}}>
    <E d={0} from="left" style={{flex:1}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <Zap size={60} color={C.orange} strokeWidth={1.5} />
          <div style={{fontSize:32, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>SOP Operativo</div>
        </div>
        <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
          Sistema completo de decisiones
        </div>
      </div>
    </E>
    <E d={15} from="pop">
      <ArrowRight size={60} color={C.accent} strokeWidth={2} />
    </E>
    <E d={30} from="right" style={{flex:1}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <Settings size={60} color={C.purple} strokeWidth={1.5} />
          <div style={{fontSize:32, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Optimización</div>
        </div>
        <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
          Sin romper lo que funciona
        </div>
      </div>
    </E>
  </Safe>
);

// Sección 4: Culminación en Operación
const OperationSection:React.FC = () => (
  <Safe style={{gap:50}}>
    <E d={0} from="up">
      <div style={{fontSize:32, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Todo esto se convierte en
      </div>
    </E>
    <E d={15} from="pop" style={{position:'relative'}}>
      <div style={{width:400, height:400, borderRadius:200, background:`linear-gradient(135deg, ${C.accent}22, ${C.purple}22)`, border:`3px solid ${C.accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 60px ${C.accent}33`}}>
        <div style={{fontSize:72, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          OPERACIÓN
        </div>
      </div>
      <div style={{position:'absolute', top:-20, left:-20, width:40, height:40, borderRadius:20, background:C.orange, animation:'pulse 2s infinite'}}>
        <Target size={24} color={C.bg} style={{margin:8}} />
      </div>
      <div style={{position:'absolute', bottom:-20, right:-20, width:40, height:40, borderRadius:20, background:C.purple, animation:'pulse 2s infinite'}}>
        <Zap size={24} color={C.bg} style={{margin:8}} />
      </div>
    </E>
  </Safe>
);

export const M11Reveal062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <Fd dur={90} fi={10} fo={10}>
            <DifferentiationSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <Fd dur={120} fi={10} fo={10}>
            <DecisionTreeSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={100}>
          <Fd dur={100} fi={10} fo={10}>
            <SOPSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={119}>
          <Fd dur={119} fi={10} fo={1}>
            <OperationSection />
          </Fd>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};