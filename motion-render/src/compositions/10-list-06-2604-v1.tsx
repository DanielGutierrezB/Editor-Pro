import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { AlertTriangle, BarChart3, FileText, Target, TrendingUp } from 'lucide-react';
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

const IntroSection:React.FC = () => (
  <Fd dur={96} fi={10} fo={10}>
    <Safe>
      <E d={0} from="pop">
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:60, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif", marginBottom:20}}>
            Cinco Errores Críticos
          </div>
          <div style={{fontSize:28, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
            Que debes evitar en tus reportes
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const ErrorItem:React.FC<{number:number; icon:React.ReactNode; text:string; accent:string; d:number}> = ({number,icon,text,accent,d}) => {
  const frame = useCurrentFrame();
  const progress = spring({frame:frame-d,fps:30,config:{damping:14,mass:0.4}});
  const highlightWidth = interpolate(progress,[0,1],[0,1200]);
  
  return (
    <E d={d} from="up" style={{width:'100%', maxWidth:1200, marginBottom:24}}>
      <div style={{position:'relative', display:'flex', alignItems:'center', gap:24, padding:'20px 24px', background:C.card, borderRadius:12, border:`1px solid ${C.border}`, fontFamily:"'DM Sans',sans-serif"}}>
        <Rect 
          width={highlightWidth}
          height={80}
          fill={`${accent}15`}
          style={{position:'absolute', left:0, top:0, borderRadius:12}}
        />
        <div style={{position:'relative', zIndex:1, display:'flex', alignItems:'center', gap:24, width:'100%'}}>
          <div style={{width:60, height:60, borderRadius:30, background:`${accent}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:accent, flexShrink:0}}>
            {number}
          </div>
          <div style={{color:accent, flexShrink:0}}>
            {icon}
          </div>
          <div style={{fontSize:24, fontWeight:700, color:C.text, flex:1}}>
            {text}
          </div>
        </div>
      </div>
    </E>
  );
};

const ErrorsListSection:React.FC = () => (
  <Fd dur={561} fi={10} fo={1}>
    <Safe style={{justifyContent:'flex-start', paddingTop:40}}>
      <ErrorItem
        number={1}
        icon={<BarChart3 size={40} strokeWidth={2}/>}
        text="Listar métricas sin decir qué significan"
        accent={C.red}
        d={0}
      />
      <ErrorItem
        number={2}
        icon={<FileText size={40} strokeWidth={2}/>}
        text="Dar conclusiones sin mostrar los datos que las soportan"
        accent={C.orange}
        d={60}
      />
      <ErrorItem
        number={3}
        icon={<AlertTriangle size={40} strokeWidth={2}/>}
        text="Hablar de un problema sin proponer una acción concreta"
        accent={C.purple}
        d={120}
      />
      <ErrorItem
        number={4}
        icon={<Target size={40} strokeWidth={2}/>}
        text="Actuar en el lugar equivocado del funnel"
        accent={C.accent}
        d={180}
      />
      <ErrorItem
        number={5}
        icon={<TrendingUp size={40} strokeWidth={2}/>}
        text="No conectar lo que pasa en Meta con lo que pasa en el negocio"
        accent={C.red}
        d={240}
      />
    </Safe>
  </Fd>
);

export const M10List062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={96}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={561}>
          <ErrorsListSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};