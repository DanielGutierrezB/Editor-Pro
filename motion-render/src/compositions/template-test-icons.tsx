import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Shield, Zap, Globe } from 'lucide-react';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});const y=from==='up'?interpolate(p,[0,1],[80,0]):0;const sc=from==='pop'?interpolate(p,[0,1],[0.85,1]):1;return <div style={{transform:`translateY(${y}px) scale(${sc})`,opacity:p,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _fo=Math.max(1,fo);const _end=Math.max(_fi+1,dur-_fo);return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};
const CascadeItem:React.FC<{d:number;index:number;children:React.ReactNode}> = ({d,index,children}) => {const frame=useCurrentFrame();const delay=d+index*8;const dist=60+index*15;const dur2=22+index*2;const p=interpolate(frame-delay,[0,dur2],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[dist,0])}px)`,filter:`blur(${interpolate(p,[0,0.5,1],[4,1,0])}px)`}}>{children}</div>;};

const TITLE = "Pilares del Sistema";
const ITEMS = [
  {icon: Shield, label: "Estructura", accent: C.accent},
  {icon: Zap, label: "Señales", accent: C.orange},
  {icon: Globe, label: "Medición", accent: C.purple},
];

const Section1:React.FC = () => {
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center',alignItems:'center'}}>
        <E d={0} from="up" style={{marginBottom:60,textAlign:'center'}}>
          <div style={{fontSize:42,fontWeight:700,color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex',gap:140,justifyContent:'center'}}>
          {ITEMS.map((item,i) => (
            <CascadeItem key={i} d={15} index={i}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20}}>
                <div style={{width:180,height:180,borderRadius:90,background:C.card,border:`1px solid ${item.accent}30`,boxShadow:`0 0 30px ${item.accent}10, 0 8px 32px rgba(0,0,0,0.3)`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <item.icon size={80} color={item.accent} strokeWidth={1.5}/>
                </div>
                <div style={{fontSize:24,fontWeight:700,color:C.text,textAlign:'center'}}>{item.label}</div>
              </div>
            </CascadeItem>
          ))}
        </div>
      </Safe>
    </Fd>
  );
};

export const TemplateTestIcons:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={210} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
