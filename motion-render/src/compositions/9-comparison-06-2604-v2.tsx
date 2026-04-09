import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { TrendingUp, DollarSign, Users, Target, BarChart3, ArrowRight } from 'lucide-react';
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
      <div style={{textAlign:'center', maxWidth:800}}>
        <div style={{fontSize:56, fontWeight:700, color:C.text, marginBottom:20, fontFamily:"'DM Sans',sans-serif"}}>
          Adapta el Lenguaje
        </div>
        <div style={{fontSize:24, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
          Técnico vs Business
        </div>
      </div>
    </E>
  </Safe>
);

const ComparisonSection:React.FC = () => (
  <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
    <E d={0} from="left" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <BarChart3 size={28} color={C.bg} strokeWidth={2} />
          </div>
          <div style={{fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Audiencia Técnica</div>
        </div>
        <div style={{fontSize:20, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>Puedes usar métricas directamente:</div>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• CTR bajó a 0.6%</div>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• CPA subió 15%</div>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• CBR necesita optimización</div>
        </div>
      </div>
    </E>
    <E d={8} from="pop" style={{alignSelf:'center'}}>
      <div style={{width:56, height:56, borderRadius:28, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:16, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
    </E>
    <E d={15} from="right" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.orange}22`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <div style={{width:60, height:60, borderRadius:30, background:C.orange, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <DollarSign size={28} color:{C.bg} strokeWidth={2} />
          </div>
          <div style={{fontSize:28, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Cliente/Dueño</div>
        </div>
        <div style={{fontSize:20, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>Empieza por el resultado:</div>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• Dinero, ventas, leads</div>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• Después explicas el por qué</div>
          <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>• Usa lenguaje simple</div>
        </div>
      </div>
    </E>
  </Safe>
);

const ExampleSection:React.FC = () => (
  <Safe>
    <E d={0} from="up">
      <div style={{textAlign:'center', marginBottom:40}}>
        <div style={{fontSize:40, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Ejemplo de Transformación</div>
      </div>
    </E>
    <E d={15} from="left" style={{width:'100%', maxWidth:1400}}>
      <div style={{display:'flex', alignItems:'center', gap:40, justifyContent:'center'}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.red}33`, padding:24, flex:1, maxWidth:600}}>
          <div style={{fontSize:18, fontWeight:700, color:C.red, marginBottom:12, fontFamily:"'DM Sans',sans-serif"}}>❌ Lenguaje Técnico</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
            "El CTR bajó a 0.6%"
          </div>
        </div>
        <ArrowRight size={40} color={C.accent} strokeWidth={2} />
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.green}33`, padding:24, flex:1, maxWidth:600}}>
          <div style={{fontSize:18, fontWeight:700, color:C.green, marginBottom:12, fontFamily:"'DM Sans',sans-serif"}}>✅ Lenguaje Business</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
            "El anuncio está perdiendo fuerza para atraer clics, subiendo el costo por venta"
          </div>
        </div>
      </div>
    </E>
  </Safe>
);

const SolutionSection:React.FC = () => (
  <Safe>
    <E d={0} from="up">
      <div style={{textAlign:'center', maxWidth:1200}}>
        <div style={{fontSize:48, fontWeight:700, color:C.accent, marginBottom:24, fontFamily:"'DM Sans',sans-serif"}}>La Solución</div>
        <div style={{fontSize:24, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
          "Esta semana vamos a probar nuevas versiones para corregir esto"
        </div>
      </div>
    </E>
    <E d={20} from="pop" style={{marginTop:40}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.accent}33`, padding:32, textAlign:'center'}}>
        <div style={{fontSize:20, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
          Mismo problema, idioma diferente
        </div>
      </div>
    </E>
  </Safe>
);

export const M9Comparison062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <Fd dur={90} fi={10} fo={10}>
            <TitleSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={270}>
          <Fd dur={270} fi={10} fo={10}>
            <ComparisonSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={420}>
          <Fd dur={420} fi={10} fo={10}>
            <ExampleSection />
          </Fd>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={228}>
          <Fd dur={228} fi={10} fo={1}>
            <SolutionSection />
          </Fd>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};