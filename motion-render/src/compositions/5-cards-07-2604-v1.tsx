import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, getInputProps} from 'remotion';
import { ArrowRight, AlertTriangle, Search } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

const _static = (getInputProps() as any).staticPreview === true;

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
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const Section1:React.FC = () => (
  <Fd dur={120} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', marginBottom:24, fontFamily:"'DM Sans',sans-serif"}}>
          Escenario 2
        </div>
      </E>
      <E d={15} from="pop">
        <div style={{fontSize:32, fontWeight:400, color:C.orange, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Gasta sin convertir
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:40, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:500}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, height:280, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:20}}>
          <Img src="https://cdn.brandfetch.io/facebook.com?c=RsXq1MGZS7awjtBZtwwytAo0_ggkjr5zbQfheelb2S2_SKUJhINddLZjnKkVLiuIVBcv_LlqSsIrNgS1dxkd5Q&theme=dark&type=icon" 
               style={{width:60, height:60, objectFit:'contain'}} />
          <div style={{fontSize:24, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
            Meta entrega
          </div>
          <div style={{width:'100%', height:4, backgroundColor:C.accent, borderRadius:2}} />
          <div style={{width:'80%', height:4, backgroundColor:C.dim, borderRadius:2, opacity:0.3}} />
        </div>
      </E>
      
      <E d={15} from="pop" style={{alignSelf:'center'}}>
        <ArrowRight size={40} color={C.dim} strokeWidth={2} />
      </E>
      
      <E d={30} from="right" style={{flex:1, maxWidth:500}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, height:280, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', gap:20}}>
          <div style={{width:60, height:60, borderRadius:30, background:C.red, display:'flex', alignItems:'center', justifyContent:'center'}}>
            <span style={{fontSize:32, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>0</span>
          </div>
          <div style={{fontSize:24, fontWeight:700, color:C.red, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
            Sin resultados
          </div>
          <div style={{width:'100%', height:4, backgroundColor:C.dim, borderRadius:2, opacity:0.2}} />
          <div style={{width:'60%', height:4, backgroundColor:C.dim, borderRadius:2, opacity:0.2}} />
        </div>
      </E>
    </Safe>
  </Fd>
);

const Section3:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:32}}>
          <AlertTriangle size={40} color={C.orange} strokeWidth={2} />
          <div style={{fontSize:36, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
            ¿Dónde está el problema?
          </div>
        </div>
      </E>
      
      <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
        <E d={15} from="left" style={{flex:1, maxWidth:480}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.purple}33`, padding:28, textAlign:'center', boxShadow:`0 0 20px ${C.purple}15`}}>
            <div style={{fontSize:28, fontWeight:700, color:C.purple, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>
              Dentro de Meta
            </div>
            <div style={{width:'100%', height:3, backgroundColor:C.dim, borderRadius:2, marginBottom:8, opacity:0.3}} />
            <div style={{width:'85%', height:3, backgroundColor:C.dim, borderRadius:2, marginBottom:8, opacity:0.3}} />
            <div style={{width:'70%', height:3, backgroundColor:C.dim, borderRadius:2, opacity:0.3}} />
          </div>
        </E>
        
        <E d={25} from="pop" style={{alignSelf:'center'}}>
          <div style={{fontSize:24, fontWeight:700, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>O</div>
        </E>
        
        <E d={35} from="right" style={{flex:1, maxWidth:480}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.orange}33`, padding:28, textAlign:'center', boxShadow:`0 0 20px ${C.orange}15`}}>
            <div style={{fontSize:28, fontWeight:700, color:C.orange, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>
              Fuera de Meta
            </div>
            <div style={{width:'100%', height:3, backgroundColor:C.dim, borderRadius:2, marginBottom:8, opacity:0.3}} />
            <div style={{width:'90%', height:3, backgroundColor:C.dim, borderRadius:2, marginBottom:8, opacity:0.3}} />
            <div style={{width:'75%', height:3, backgroundColor:C.dim, borderRadius:2, opacity:0.3}} />
          </div>
        </E>
      </Safe>
    </Safe>
  </Fd>
);

const Section4:React.FC = () => (
  <Fd dur={57} fi={10} fo={1}>
    <Safe style={{gap:30}}>
      <E d={0} from="up">
        <div style={{display:'flex', alignItems:'center', gap:16}}>
          <Search size={48} color={C.accent} strokeWidth={2} />
          <div style={{fontSize:42, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
            Diagnóstico fuera de Meta
          </div>
        </div>
      </E>
      <E d={20} from="pop">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Próximo tema
        </div>
      </E>
    </Safe>
  </Fd>
);

export const M5Cards072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={120}>
          <Section1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={150}>
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
        <TransitionSeries.Sequence durationInFrames={57}>
          <Section4 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};