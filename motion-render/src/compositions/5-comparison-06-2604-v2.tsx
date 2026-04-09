import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { TrendingDown, TrendingUp, AlertTriangle, CheckCircle, ArrowRight, BarChart3, Target } from 'lucide-react';
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

const TitleSection:React.FC = () => (
  <Safe>
    <E d={0} from="up">
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:64, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
          Defendiendo Decisiones
        </div>
        <div style={{fontSize:28, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
          Con datos, no intuición
        </div>
      </div>
    </E>
  </Safe>
);

const ComparisonSection:React.FC = () => (
  <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
    <E d={0} from="left" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:420}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <AlertTriangle size={32} color={C.red} strokeWidth={2} />
          <div style={{fontSize:24, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>Respuesta Amateur</div>
        </div>
        <div style={{fontSize:20, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
          "Apagué el anuncio porque no funcionaba"
        </div>
        <div style={{fontSize:18, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>
          • Basado en intuición<br/>
          • "Sentía que ya no funcionaba"<br/>
          • Sin datos específicos<br/>
          • Reacción emocional
        </div>
      </div>
    </E>
    <E d={15} from="pop" style={{alignSelf:'center'}}>
      <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
    </E>
    <E d={30} from="right" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:420}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <CheckCircle size={32} color={C.accent} strokeWidth={2} />
          <div style={{fontSize:24, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Criterio Profesional</div>
        </div>
        <div style={{fontSize:20, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
          Decisión basada en datos específicos
        </div>
        <div style={{fontSize:18, color:C.dim, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>
          • Hallazgo en los datos<br/>
          • Interpretación clara<br/>
          • Acción justificada<br/>
          • Criterio fundamentado
        </div>
      </div>
    </E>
  </Safe>
);

const DataExampleSection:React.FC = () => (
  <Safe>
    <E d={0} from="up" style={{marginBottom:40}}>
      <div style={{fontSize:36, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
        Ejemplo: Respuesta con Datos
      </div>
    </E>
    <E d={15} from="up" style={{width:'100%', maxWidth:1200}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{fontSize:24, color:C.text, lineHeight:1.8, fontFamily:"'DM Sans',sans-serif", textAlign:'center'}}>
          "Después de <span style={{color:C.accent, fontWeight:700}}>5 días</span>, el CPA estaba <span style={{color:C.orange, fontWeight:700}}>40% por encima</span> del objetivo, con un CTR que bajó de <span style={{color:C.accent, fontWeight:700}}>1.2%</span> a <span style={{color:C.red, fontWeight:700}}>0.5%</span>. La data sugiere <span style={{color:C.purple, fontWeight:700}}>fatiga creativa</span>. Decidí pausarlo para no seguir quemando presupuesto mientras probábamos alternativas."
        </div>
      </div>
    </E>
  </Safe>
);

const MetricsBreakdownSection:React.FC = () => {
  const frame = useCurrentFrame();
  const cpaProgress = spring({frame:frame-20, fps:30, config:{damping:14, mass:0.4}});
  const ctrProgress = spring({frame:frame-35, fps:30, config:{damping:14, mass:0.4}});
  
  const cpaValue = Math.round(interpolate(cpaProgress, [0,1], [0, 40]));
  const ctrFrom = interpolate(ctrProgress, [0,1], [0, 1.2]);
  const ctrTo = interpolate(ctrProgress, [0,1], [0, 0.5]);

  return (
    <Safe style={{flexDirection:'row', gap:80, justifyContent:'center'}}>
      <E d={0} from="left" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
        <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.orange}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.orange}22`}}>
          <TrendingUp size={50} color={C.orange} strokeWidth={2} />
        </div>
        <div style={{fontSize:48, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>+{cpaValue}%</div>
        <div style={{fontSize:20, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>CPA por encima<br/>del objetivo</div>
      </E>
      
      <E d={15} from="up" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
        <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.red}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.red}22`}}>
          <TrendingDown size={50} color={C.red} strokeWidth={2} />
        </div>
        <div style={{fontSize:32, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
          {ctrFrom.toFixed(1)}% → {ctrTo.toFixed(1)}%
        </div>
        <div style={{fontSize:20, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>CTR bajó<br/>significativamente</div>
      </E>
      
      <E d={30} from="right" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
        <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.purple}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.purple}22`}}>
          <Target size={50} color={C.purple} strokeWidth={2} />
        </div>
        <div style={{fontSize:28, fontWeight:700, color:C.purple, fontFamily:"'DM Sans',sans-serif"}}>Fatiga</div>
        <div style={{fontSize:20, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Diagnóstico:<br/>Fatiga creativa</div>
      </E>
    </Safe>
  );
};

const ActionSection:React.FC = () => (
  <Safe style={{flexDirection:'row', gap:40, alignItems:'center', justifyContent:'center'}}>
    <E d={0} from="left" style={{flex:1, maxWidth:400}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, textAlign:'center'}}>
        <BarChart3 size={60} color={C.red} strokeWidth={2} style={{margin:'0 auto 20px'}} />
        <div style={{fontSize:24, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:12}}>
          Datos Claros
        </div>
        <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
          5 días, CPA +40%, CTR 1.2%→0.5%
        </div>
      </div>
    </E>
    
    <E d={15} from="pop">
      <ArrowRight size={40} color={C.accent} strokeWidth={3} />
    </E>
    
    <E d={30} from="right" style={{flex:1, maxWidth:400}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, textAlign:'center'}}>
        <CheckCircle size={60} color={C.accent} strokeWidth={2} style={{margin:'0 auto 20px'}} />
        <div style={{fontSize:24, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:12}}>
          Acción Justificada
        </div>
        <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
          Pausar para probar alternativas
        </div>
      </div>
    </E>
  </Safe>
);

export const M5Comparison062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
          <Fd dur={120} fi={10} fo={10}>
            <TitleSection />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={420}>
          <Fd dur={420} fi={10} fo={10}>
            <ComparisonSection />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={270}>
          <Fd dur={270} fi={10} fo={10}>
            <DataExampleSection />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={360}>
          <Fd dur={360} fi={10} fo={10}>
            <MetricsBreakdownSection />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={285}>
          <Fd dur={285} fi={10} fo={1}>
            <ActionSection />
          </Fd>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};