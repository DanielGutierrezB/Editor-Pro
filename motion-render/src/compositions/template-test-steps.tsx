import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Search, Target, Send } from 'lucide-react';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});const y=from==='up'?interpolate(p,[0,1],[80,0]):0;const sc=from==='pop'?interpolate(p,[0,1],[0.85,1]):1;return <div style={{transform:`translateY(${y}px) scale(${sc})`,opacity:p,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _fo=Math.max(1,fo);const _end=Math.max(_fi+1,dur-_fo);return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const STEPS = [
  {Icon:Search, title:"Investigación", desc:"Analiza tu mercado y competencia", accent:C.accent},
  {Icon:Target, title:"Segmentación", desc:"Define tu audiencia ideal", accent:C.orange},
  {Icon:Send, title:"Ejecución", desc:"Lanza con métricas de seguimiento", accent:C.purple},
];

const StepView:React.FC<{idx:number}> = ({idx}) => {
  const {durationInFrames:dur} = useVideoConfig();
  const s = STEPS[idx];
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center',alignItems:'center'}}>
        <E d={0} from="pop">
          <div style={{fontSize:14,fontWeight:700,color:C.bg,backgroundColor:s.accent,borderRadius:20,padding:'6px 20px',letterSpacing:2,textTransform:'uppercase',marginBottom:24}}>
            Paso {idx+1} de {STEPS.length}
          </div>
        </E>
        <E d={5} from="pop">
          <div style={{width:160,height:160,borderRadius:80,background:C.card,border:`2px solid ${s.accent}`,boxShadow:`0 0 40px ${s.accent}15, 0 16px 48px rgba(0,0,0,0.4)`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:28}}>
            <s.Icon size={72} color={s.accent} strokeWidth={1.5}/>
          </div>
        </E>
        <E d={12} from="up"><div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center',marginBottom:16}}>{s.title}</div></E>
        <E d={20} from="up"><div style={{fontSize:24,fontWeight:400,color:C.dim,textAlign:'center',maxWidth:600}}>{s.desc}</div></E>
        {/* Progress dots */}
        <E d={5} from="pop" style={{position:'absolute',bottom:60,left:'50%',transform:'translateX(-50%)'}}>
          <div style={{display:'flex',gap:12}}>
            {STEPS.map((_,i) => <div key={i} style={{width:i===idx?32:8,height:8,borderRadius:4,backgroundColor:i===idx?s.accent:i<idx?`${s.accent}60`:'rgba(255,255,255,0.15)'}}/>)}
          </div>
        </E>
      </Safe>
    </Fd>
  );
};

export const TemplateTestSteps:React.FC = () => {
  const fps = 120; // per step
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      {STEPS.map((_,i) => <Sequence key={i} from={i*fps} durationInFrames={i===STEPS.length-1?fps+30:fps} premountFor={10}><StepView idx={i}/></Sequence>)}
    </AbsoluteFill>
  );
};
