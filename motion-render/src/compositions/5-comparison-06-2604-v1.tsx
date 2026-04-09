import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { Brain, BarChart3, TrendingUp, Eye, Target, Zap } from 'lucide-react';
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

const Section1:React.FC = () => (
  <Fd dur={125} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
          Cómo defender decisiones con datos
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif", maxWidth:800}}>
          La diferencia entre reaccionar y operar con criterio
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <div style={{width:80, height:80, borderRadius:40, background:`${C.red}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.red}`}}>
              <Brain size={40} color={C.red} strokeWidth={1.5} />
            </div>
            <div style={{fontSize:32, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>REACCIÓN</div>
          </div>
          <div style={{fontSize:20, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif", marginBottom:16}}>
            "Sentía que no funcionaba"
          </div>
          <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
            • Decisiones por intuición<br/>
            • Sin fundamento objetivo<br/>
            • Difícil de justificar
          </div>
        </div>
      </E>
      <E d={8} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
      </E>
      <E d={15} from="right" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <div style={{width:80, height:80, borderRadius:40, background:`${C.accent}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.accent}`}}>
              <BarChart3 size={40} color={C.accent} strokeWidth={1.5} />
            </div>
            <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>CRITERIO</div>
          </div>
          <div style={{fontSize:20, color:C.text, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif", marginBottom:16}}>
            "Lo vi en los datos"
          </div>
          <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
            • Decisiones fundamentadas<br/>
            • Basado en evidencia<br/>
            • Fácil de defender
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif", marginBottom:40}}>
          Proceso con criterio
        </div>
      </E>
      <E d={15} from="up" style={{width:'100%'}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', maxWidth:1200}}>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
            <div style={{width:120, height:120, borderRadius:60, background:`${C.orange}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.orange}`}}>
              <Eye size={60} color={C.orange} strokeWidth={1.5} />
            </div>
            <div style={{fontSize:24, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Ver</div>
            <div style={{fontSize:18, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>en los datos</div>
          </div>
          <div style={{fontSize:32, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>→</div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
            <div style={{width:120, height:120, borderRadius:60, background:`${C.purple}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.purple}`}}>
              <TrendingUp size={60} color={C.purple} strokeWidth={1.5} />
            </div>
            <div style={{fontSize:24, fontWeight:700, color:C.purple, fontFamily:"'DM Sans',sans-serif"}}>Interpretar</div>
            <div style={{fontSize:18, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>el hallazgo</div>
          </div>
          <div style={{fontSize:32, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>→</div>
          <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
            <div style={{width:120, height:120, borderRadius:60, background:`${C.accent}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.accent}`}}>
              <Target size={60} color={C.accent} strokeWidth={1.5} />
            </div>
            <div style={{fontSize:24, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Decidir</div>
            <div style={{fontSize:18, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>con fundamento</div>
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif", marginBottom:40}}>
          Ejemplos de decisiones defendibles
        </div>
      </E>
      <E d={15} from="left" style={{width:'100%'}}>
        <div style={{display:'flex', flexDirection:'column', gap:24, maxWidth:1000}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, display:'flex', alignItems:'center', gap:20}}>
            <div style={{fontSize:24, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>💰</div>
            <div style={{flex:1}}>
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:8}}>
                "Subí el presupuesto porque..."
              </div>
              <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                El CPA bajó 30% y tenemos margen para escalar
              </div>
            </div>
          </div>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, display:'flex', alignItems:'center', gap:20}}>
            <div style={{fontSize:24, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>⏸️</div>
            <div style={{flex:1}}>
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:8}}>
                "Apagué el anuncio porque..."
              </div>
              <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                El CTR cayó 60% en 3 días consecutivos
              </div>
            </div>
          </div>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, display:'flex', alignItems:'center', gap:20}}>
            <div style={{fontSize:24, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>🎯</div>
            <div style={{flex:1}}>
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:8}}>
                "Cambié de objetivo porque..."
              </div>
              <div style={{fontSize:18, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                Las conversiones aumentaron 40% con el nuevo setup
              </div>
            </div>
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section5:React.FC = () => (
  <Fd dur={250} fi={10} fo={1}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif", marginBottom:30}}>
          Criterio vs Reacción
        </div>
      </E>
      <E d={15} from="pop" style={{marginBottom:40}}>
        <div style={{width:100, height:100, borderRadius:50, background:`${C.accent}22`, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${C.accent}`, boxShadow:`0 0 30px ${C.accent}33`}}>
          <Zap size={50} color={C.accent} strokeWidth={1.5} />
        </div>
      </E>
      <E d={30} from="up">
        <div style={{fontSize:28, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif", lineHeight:1.6, maxWidth:900}}>
          Eso es lo que separa a alguien que opera con criterio<br/>
          de alguien que solo reacciona
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M5Comparison062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={125}>
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
        <TransitionSeries.Sequence durationInFrames={180}>
          <Section4 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={250}>
          <Section5 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};