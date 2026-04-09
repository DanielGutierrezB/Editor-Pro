import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { AlertTriangle, CheckCircle, BarChart3, TrendingUp } from 'lucide-react';
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
  <Fd dur={93} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          ¿Cómo explicar qué está pasando?
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:28, color:C.dim, textAlign:'center', marginTop:20, fontFamily:"'DM Sans',sans-serif"}}>
          Con los reportes
        </div>
      </E>
    </Safe>
  </Fd>
);

const ComparisonSection:React.FC = () => (
  <Fd dur={414} fi={10} fo={1}>
    <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:480}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <AlertTriangle size={40} color={C.red} strokeWidth={1.5} />
            <div style={{fontSize:32, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>Método Incorrecto</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:32, fontFamily:"'DM Sans',sans-serif"}}>
            La mayoría de gente hace lo mismo:
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:20}}>
            <E d={60} from="pop">
              <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CTR 1.2%</div>
            </E>
            <E d={90} from="pop">
              <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CPC $0.8</div>
            </E>
            <E d={120} from="pop">
              <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CPA $15</div>
            </E>
            <E d={150} from="pop">
              <div style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>ROAS 3.2</div>
            </E>
          </div>
          <E d={180} from="up">
            <div style={{fontSize:18, color:C.red, marginTop:32, fontStyle:'italic', fontFamily:"'DM Sans',sans-serif"}}>
              Eso no le dice nada a nadie
            </div>
          </E>
        </div>
      </E>
      
      <E d={15} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
      </E>
      
      <E d={30} from="right" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:480}}>
          <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:24}}>
            <CheckCircle size={40} color={C.accent} strokeWidth={1.5} />
            <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Método Correcto</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:32, fontFamily:"'DM Sans',sans-serif"}}>
            Estructura narrativa con contexto:
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:24}}>
            <E d={210} from="up">
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <TrendingUp size={24} color={C.accent} />
                <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                  CTR mejoró 1.2% vs mes anterior
                </div>
              </div>
            </E>
            <E d={240} from="up">
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <BarChart3 size={24} color={C.accent} />
                <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                  CPC optimizado a $0.8 (meta: <$1)
                </div>
              </div>
            </E>
            <E d={270} from="up">
              <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                <span style={{color:C.accent, fontWeight:700}}>Resultado:</span> CPA $15, ROAS 3.2
              </div>
            </E>
          </div>
          <E d={300} from="up">
            <div style={{fontSize:18, color:C.accent, marginTop:32, fontWeight:600, fontFamily:"'DM Sans',sans-serif"}}>
              Con contexto, los números cobran sentido
            </div>
          </E>
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M3Comparison062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={93}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={414}>
          <ComparisonSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};