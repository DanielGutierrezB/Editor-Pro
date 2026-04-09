import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { TrendingUp, DollarSign, Users, Target, BarChart3, ArrowRight, MessageSquare } from 'lucide-react';
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
  <Safe style={{flexDirection:'column', gap:30}}>
    <E d={0} from="up">
      <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Adaptación del Lenguaje
      </div>
    </E>
    <E d={15} from="up">
      <div style={{fontSize:24, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Según tu audiencia
      </div>
    </E>
    <E d={30} from="pop">
      <div style={{width:80, height:4, background:C.accent, borderRadius:2}} />
    </E>
  </Safe>
);

const ComparisonSection:React.FC = () => (
  <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
    <E d={0} from="left" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <BarChart3 size={60} color={C.accent} strokeWidth={1.5} />
          <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Técnico</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• CTR, CPA, CBR</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• Métricas directas</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• Datos específicos</div>
        </div>
      </div>
    </E>
    
    <E d={8} from="pop" style={{alignSelf:'center'}}>
      <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
    </E>
    
    <E d={15} from="right" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
          <DollarSign size={60} color={C.orange} strokeWidth={1.5} />
          <div style={{fontSize:32, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Business</div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• Dinero, ventas, leads</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• Resultados primero</div>
          <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>• Explicación después</div>
        </div>
      </div>
    </E>
  </Safe>
);

const ExampleSection:React.FC = () => (
  <Safe style={{flexDirection:'column', gap:40}}>
    <E d={0} from="up">
      <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
        Ejemplo de Transformación
      </div>
    </E>
    
    <E d={15} from="up" style={{width:'100%', maxWidth:1200}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.red}33`, padding:32}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
          <Target size={40} color={C.red} strokeWidth={1.5} />
          <div style={{fontSize:24, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>❌ Lenguaje Técnico</div>
        </div>
        <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif", fontStyle:'italic'}}>
          "El CTR bajó a 0.6%"
        </div>
      </div>
    </E>
    
    <E d={30} from="pop" style={{alignSelf:'center'}}>
      <ArrowRight size={50} color={C.accent} strokeWidth={2} />
    </E>
    
    <E d={45} from="down" style={{width:'100%', maxWidth:1200}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.green}33`, padding:32}}>
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
          <MessageSquare size={40} color={C.green} strokeWidth={1.5} />
          <div style={{fontSize:24, fontWeight:700, color:C.green, fontFamily:"'DM Sans',sans-serif"}}>✅ Lenguaje Business</div>
        </div>
        <div style={{fontSize:22, color:C.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.4}}>
          "El anuncio está perdiendo fuerza para atraer clics. Eso está subiendo el costo por venta y esta semana vamos a probar nuevas versiones para corregir lo mismo."
        </div>
      </div>
    </E>
  </Safe>
);

export const M9Comparison062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
          <Fd dur={120} fi={10} fo={10}>
            <IntroSection />
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
        
        <TransitionSeries.Sequence durationInFrames={630}>
          <Fd dur={630} fi={10} fo={1}>
            <ExampleSection />
          </Fd>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};