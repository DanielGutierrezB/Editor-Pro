import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { BarChart3, TrendingUp, Target, DollarSign } from 'lucide-react';
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
  <Fd dur={90} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:52, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Reportes que Funcionan
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', marginTop:20, fontFamily:"'DM Sans',sans-serif"}}>
          Cómo explicar qué está pasando
        </div>
      </E>
    </Safe>
  </Fd>
);

const ComparisonSection:React.FC = () => (
  <Fd dur={417} fi={10} fo={1}>
    <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:480}}>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:24}}>
            <BarChart3 size={40} color={C.red} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>INCORRECTO</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:32, fontFamily:"'DM Sans',sans-serif"}}>
            Lista simple de números
          </div>
          
          <div style={{display:'flex', flexDirection:'column', gap:20}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.red}} />
              <span style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CTR 1.2%</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.red}} />
              <span style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CPC $0.8</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.red}} />
              <span style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CPA $15</span>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:8, height:8, borderRadius:4, background:C.red}} />
              <span style={{fontSize:24, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>ROAS 3.2</span>
            </div>
          </div>
          
          <div style={{marginTop:40, padding:16, background:'rgba(248,113,113,0.1)', borderRadius:8, border:`1px solid rgba(248,113,113,0.3)`}}>
            <div style={{fontSize:18, color:C.red, fontWeight:700, fontFamily:"'DM Sans',sans-serif"}}>Sin contexto</div>
            <div style={{fontSize:16, color:C.dim, marginTop:8, fontFamily:"'DM Sans',sans-serif"}}>No le dice nada a nadie</div>
          </div>
        </div>
      </E>

      <E d={8} from="pop" style={{alignSelf:'center'}}>
        <div style={{width:60, height:60, borderRadius:30, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:18, fontFamily:"'DM Sans',sans-serif"}}>VS</div>
      </E>

      <E d={15} from="right" style={{flex:1, maxWidth:620}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, height:480}}>
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:24}}>
            <Target size={40} color={C.accent} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>CORRECTO</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:32, fontFamily:"'DM Sans',sans-serif"}}>
            Estructura con contexto
          </div>
          
          <div style={{display:'flex', flexDirection:'column', gap:24}}>
            <div style={{background:'rgba(10,233,141,0.05)', padding:20, borderRadius:8, border:`1px solid rgba(10,233,141,0.2)`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                <TrendingUp size={24} color={C.accent} strokeWidth={1.5} />
                <span style={{fontSize:20, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Rendimiento</span>
              </div>
              <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CTR: 1.2% (+15% vs mes anterior)</div>
            </div>
            
            <div style={{background:'rgba(10,233,141,0.05)', padding:20, borderRadius:8, border:`1px solid rgba(10,233,141,0.2)`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                <DollarSign size={24} color={C.accent} strokeWidth={1.5} />
                <span style={{fontSize:20, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Costos</span>
              </div>
              <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>CPC: $0.8 | CPA: $15</div>
            </div>
            
            <div style={{background:'rgba(10,233,141,0.05)', padding:20, borderRadius:8, border:`1px solid rgba(10,233,141,0.2)`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:12}}>
                <BarChart3 size={24} color={C.accent} strokeWidth={1.5} />
                <span style={{fontSize:20, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>ROI</span>
              </div>
              <div style={{fontSize:18, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>ROAS: 3.2x (Meta: 2.5x)</div>
            </div>
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M3Comparison062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={417}>
          <ComparisonSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};