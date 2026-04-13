import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',red:'#f87171',orange:'#fb923c',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[80,0])}px) scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const VALUE = 73; const TARGET = 80; const SUFFIX = "%"; const LABEL = "Tasa de Conversión"; const SUBLABEL = "Meta: 80%";

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  const p = interpolate(frame-10,[0,40],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const val = Math.round(interpolate(p,[0,1],[0,VALUE]));
  const barW = interpolate(p,[0,1],[0,(VALUE/100)*100]);
  const color = VALUE >= TARGET ? C.accent : VALUE >= TARGET*0.85 ? C.orange : C.red;
  return (
    <Fd dur={dur}>
      <Safe style={{justifyContent:'center',alignItems:'center',gap:24}}>
        <E d={0} from="pop"><div style={{fontSize:120,fontWeight:700,color}}>{val}{SUFFIX}</div></E>
        <E d={15} from="up" style={{width:'100%',maxWidth:600}}>
          <div style={{height:16,backgroundColor:C.card,borderRadius:8,overflow:'hidden',position:'relative'}}>
            <div style={{height:'100%',width:`${barW}%`,backgroundColor:color,borderRadius:8}}/>
            <div style={{position:'absolute',left:`${(TARGET/100)*100}%`,top:0,bottom:0,width:2,backgroundColor:C.dim}}/>
          </div>
        </E>
        <E d={20} from="up"><div style={{fontSize:28,fontWeight:700,color:C.text}}>{LABEL}</div></E>
        <E d={25} from="up"><div style={{fontSize:20,color:C.dim}}>{SUBLABEL}</div></E>
      </Safe>
    </Fd>
  );
};
export const TemplateTestGauge:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
