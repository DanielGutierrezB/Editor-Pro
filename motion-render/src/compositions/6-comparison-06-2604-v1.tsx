import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { MessageCircle, TrendingDown, TrendingUp, Target, Eye, Pause } from 'lucide-react';
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
  <Fd dur={105} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:56, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Transformación de Respuesta
        </div>
      </E>
      <E d={15} from="pop">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', marginTop:20, fontFamily:"'DM Sans',sans-serif"}}>
          La misma decisión, diferente credibilidad
        </div>
      </E>
    </Safe>
  </Fd>
);

const ComparisonSection:React.FC = () => (
  <Fd dur={300} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <MessageCircle size={40} color={C.red} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>ANTES</div>
          </div>
          <div style={{fontSize:22, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif", fontStyle:'italic'}}>
            "Apagué el anuncio porque no funcionaba"
          </div>
          <div style={{marginTop:20, fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
            Respuesta vaga, sin datos
          </div>
        </div>
      </E>
      
      <E d={8} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
      </E>
      
      <E d={15} from="right" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <Target size={40} color={C.accent} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>DESPUÉS</div>
          </div>
          <div style={{fontSize:18, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
            "Después de 5 días, el CPA estaba 40% por encima del objetivo, con un CTR que bajó de 1.2% a 0.5%. La data sugiere fatiga creativa."
          </div>
          <div style={{marginTop:20, fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
            Respuesta basada en datos específicos
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const DataBreakdownSection:React.FC = () => (
  <Fd dur={240} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', marginBottom:40, fontFamily:"'DM Sans',sans-serif"}}>
          Datos Específicos Mencionados
        </div>
      </E>
      
      <div style={{display:'flex', flexDirection:'row', gap:40, justifyContent:'center', width:'100%'}}>
        <E d={15} from="left" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <div style={{width:100, height:100, borderRadius:50, background:C.card, border:`2px solid ${C.orange}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{fontSize:32, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>5</div>
          </div>
          <div style={{fontSize:18, color:C.text, fontWeight:700, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Días</div>
          <div style={{fontSize:16, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Período analizado</div>
        </E>
        
        <E d={25} from="pop" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <div style={{width:100, height:100, borderRadius:50, background:C.card, border:`2px solid ${C.red}`, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <TrendingUp size={40} color={C.red} strokeWidth={2} />
          </div>
          <div style={{fontSize:18, color:C.text, fontWeight:700, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>+40%</div>
          <div style={{fontSize:16, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>CPA vs objetivo</div>
        </E>
        
        <E d={35} from="right" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:12}}>
          <div style={{width:100, height:100, borderRadius:50, background:C.card, border:`2px solid ${C.purple}`, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column'}}>
            <div style={{fontSize:20, fontWeight:700, color:C.purple, fontFamily:"'DM Sans',sans-serif"}}>1.2%</div>
            <TrendingDown size={20} color={C.purple} strokeWidth={2} />
            <div style={{fontSize:20, fontWeight:700, color:C.purple, fontFamily:"'DM Sans',sans-serif"}}>0.5%</div>
          </div>
          <div style={{fontSize:18, color:C.text, fontWeight:700, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>CTR</div>
          <div style={{fontSize:16, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>Caída significativa</div>
        </E>
      </div>
    </Safe>
  </Fd>
);

const ConclusionSection:React.FC = () => (
  <Fd dur={120} fi={10} fo={1}>
    <Safe>
      <E d={0} from="up">
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:40, textAlign:'center', boxShadow:`0 8px 24px ${C.glow}`, maxWidth:800}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:24}}>
            <Pause size={40} color={C.accent} strokeWidth={1.5} />
            <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Decisión Fundamentada</div>
          </div>
          <div style={{fontSize:20, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
            "Decidí pausarlo para no seguir quemando presupuesto mientras probábamos alternativas"
          </div>
          <div style={{marginTop:20, fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
            Misma acción, máxima credibilidad
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M6Comparison062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={105}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={300}>
          <ComparisonSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={240}>
          <DataBreakdownSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120}>
          <ConclusionSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};