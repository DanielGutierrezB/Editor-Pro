import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Megaphone, Radio, Target, ShoppingCart } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const STAGES = [
  {Icon:Megaphone,title:"Campañas",pct:"100%",accent:C.accent,w:600},
  {Icon:Radio,title:"Señales",pct:"65%",accent:C.orange,w:480},
  {Icon:Target,title:"Objetivos",pct:"40%",accent:C.purple,w:360},
  {Icon:ShoppingCart,title:"Conversión",pct:"18%",accent:C.red,w:240},
];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe style={{justifyContent:'center',gap:12}}>
        {STAGES.map((s,i) => {
          const isActive = i === Math.min(Math.floor((frame-10)/60),STAGES.length-1);
          return (
            <E key={i} d={10+i*12} from="up">
              <div style={{width:s.w,padding:'14px 24px',borderRadius:12,display:'flex',alignItems:'center',gap:16,
                background:isActive?C.card:'transparent',
                border:isActive?`1px solid ${s.accent}40`:`1px solid ${C.border}`,
                boxShadow:isActive?`0 0 20px ${s.accent}10`:'none',
                margin:'0 auto'}}>
                <s.Icon size={28} color={s.accent} strokeWidth={1.5}/>
                <span style={{fontSize:22,fontWeight:700,color:isActive?C.text:C.dim,flex:1}}>{s.title}</span>
                <span style={{fontSize:20,fontWeight:700,color:s.accent}}>{s.pct}</span>
              </div>
            </E>
          );
        })}
      </Safe>
    </Fd>
  );
};
export const TemplateTestFunnel:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
