import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { Eye, MousePointer, ShoppingCart, AlertTriangle, Palette, Globe, CreditCard, ArrowDown } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Rect } from '@remotion/shapes';

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

const FunnelIntro:React.FC = () => (
  <Fd dur={270} fi={10} fo={12}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Detectar Huecos en el Funnel
        </div>
      </E>
      <E d={20} from="pop">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', marginTop:30, fontFamily:"'DM Sans',sans-serif"}}>
          Tres tramos críticos donde pueden aparecer problemas
        </div>
      </E>
    </Safe>
  </Fd>
);

const FunnelDiagram:React.FC = () => (
  <Fd dur={330} fi={12} fo={12}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:36, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Los Tres Tramos del Funnel
        </div>
      </E>
      
      <div style={{display:'flex', flexDirection:'column', gap:30, alignItems:'center'}}>
        <E d={20} from="left">
          <div style={{display:'flex', alignItems:'center', gap:40}}>
            <div style={{background:C.card, border:`1px solid ${C.accent}33`, borderRadius:12, padding:24, width:200, display:'flex', flexDirection:'column', alignItems:'center', gap:12, boxShadow:`0 8px 24px ${C.glow}`}}>
              <Eye size={40} color={C.accent} />
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Impresión</div>
            </div>
            <ArrowDown size={32} color={C.dim} style={{transform:'rotate(-90deg)'}} />
            <div style={{background:C.card, border:`1px solid ${C.orange}33`, borderRadius:12, padding:24, width:200, display:'flex', flexDirection:'column', alignItems:'center', gap:12, boxShadow:`0 8px 24px rgba(251,146,60,0.08)`}}>
              <MousePointer size={40} color={C.orange} />
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Clic</div>
            </div>
          </div>
        </E>
        
        <E d={40} from="pop">
          <ArrowDown size={32} color={C.dim} />
        </E>
        
        <E d={60} from="left">
          <div style={{display:'flex', alignItems:'center', gap:40}}>
            <div style={{background:C.card, border:`1px solid ${C.purple}33`, borderRadius:12, padding:24, width:200, display:'flex', flexDirection:'column', alignItems:'center', gap:12, boxShadow:`0 8px 24px rgba(167,139,250,0.08)`}}>
              <Globe size={40} color={C.purple} />
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Visita</div>
            </div>
            <ArrowDown size={32} color={C.dim} style={{transform:'rotate(-90deg)'}} />
            <div style={{background:C.card, border:`1px solid ${C.green}33`, borderRadius:12, padding:24, width:200, display:'flex', flexDirection:'column', alignItems:'center', gap:12, boxShadow:`0 8px 24px ${C.glow}`}}>
              <ShoppingCart size={40} color={C.green} />
              <div style={{fontSize:20, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Conversión</div>
            </div>
          </div>
        </E>
      </div>
    </Safe>
  </Fd>
);

const CTRProblem:React.FC = () => (
  <Fd dur={240} fi={12} fo={12}>
    <Safe style={{flexDirection:'row', gap:60}}>
      <E d={0} from="left" style={{flex:1}}>
        <div style={{background:C.card, border:`2px solid ${C.red}`, borderRadius:12, padding:32, boxShadow:`0 8px 24px rgba(248,113,113,0.15)`}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <AlertTriangle size={48} color={C.red} />
            <div style={{fontSize:32, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>CTR Bajo</div>
          </div>
          <div style={{fontSize:24, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>El anuncio no está enganchando</div>
          <div style={{fontSize:20, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>Problema en el primer tramo</div>
        </div>
      </E>
      
      <E d={20} from="right" style={{flex:1}}>
        <div style={{display:'flex', flexDirection:'column', gap:20}}>
          <div style={{fontSize:28, fontWeight:700, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>Causas:</div>
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`}}>
            <Palette size={32} color={C.orange} />
            <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Problema de creativo</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`}}>
            <Eye size={32} color={C.purple} />
            <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>Problema de ángulo</div>
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const ConversionProblem:React.FC = () => (
  <Fd dur={282} fi={12} fo={1}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{background:C.card, border:`2px solid ${C.orange}`, borderRadius:12, padding:32, boxShadow:`0 8px 24px rgba(251,146,60,0.15)`, textAlign:'center'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:20}}>
            <AlertTriangle size={48} color={C.orange} />
            <div style={{fontSize:32, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>CTR Bueno + Conversión Baja</div>
          </div>
          <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>El hueco está más abajo - no es el anuncio</div>
        </div>
      </E>
      
      <div style={{display:'flex', flexDirection:'row', gap:30, justifyContent:'center', flexWrap:'wrap'}}>
        <E d={30} from="left">
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`, width:280}}>
            <Globe size={32} color={C.accent} />
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>La landing</div>
          </div>
        </E>
        
        <E d={45} from="pop">
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`, width:280}}>
            <div style={{fontSize:24, color:C.green}}>💰</div>
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>El precio</div>
          </div>
        </E>
        
        <E d={60} from="right">
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`, width:280}}>
            <div style={{fontSize:24, color:C.purple}}>🎯</div>
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>La oferta</div>
          </div>
        </E>
        
        <E d={75} from="up">
          <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, padding:20, borderRadius:8, border:`1px solid ${C.border}`, width:280}}>
            <CreditCard size={32} color={C.orange} />
            <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>El checkout</div>
          </div>
        </E>
      </div>
    </Safe>
  </Fd>
);

export const M6Diagram062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={270}>
          <FunnelIntro />
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={330}>
          <FunnelDiagram />
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={240}>
          <CTRProblem />
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={282}>
          <ConversionProblem />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};