import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Brain } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${from==='up'?interpolate(p,[0,1],[80,0]):0}px) scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};
const AnimatedText:React.FC<{text:string;d:number;fontSize?:number;fontWeight?:number;color?:string;mode?:'word'|'fade';framesPerWord?:number}> = ({text,d,fontSize=36,fontWeight=700,color=C.text,mode='word',framesPerWord=4}) => {const frame=useCurrentFrame();if(mode==='fade'){const p=interpolate(frame-d,[0,25],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{fontSize,fontWeight,color,textAlign:'center',opacity:p}}>{text}</div>;}return (<div style={{fontSize,fontWeight,textAlign:'center',display:'flex',flexWrap:'wrap',justifyContent:'center',gap:`0 ${fontSize*0.3}px`}}>{text.split(' ').map((w,i)=>{const p=interpolate(frame-d-i*framesPerWord,[0,12],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <span key={i} style={{color,opacity:p,transform:`translateY(${interpolate(p,[0,1],[20,0])}px)`,display:'inline-block'}}>{w}</span>;})}</div>);};

const TITLE = "Machine Learning";
const ITEMS = ["Los datos entrenan el modelo","El modelo encuentra patrones","Los patrones generan predicciones"];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  const titlePhase = interpolate(frame,[60,85],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const titleY = interpolate(titlePhase,[0,1],[0,-180]);
  const titleScale = interpolate(titlePhase,[0,1],[1,0.75]);
  return (
    <Fd dur={dur}>
      <Safe>
        <div style={{transform:`translateY(${titleY}px) scale(${titleScale})`,display:'flex',flexDirection:'column',alignItems:'center',gap:16}}>
          <E d={0} from="pop"><Brain size={60} color={C.accent} strokeWidth={1.5}/></E>
          <AnimatedText text={TITLE} d={5} fontSize={56} fontWeight={700} mode="word"/>
        </div>
        <div style={{marginTop:120,display:'flex',flexDirection:'column',gap:24,alignItems:'center',width:'100%',maxWidth:800}}>
          {ITEMS.map((item,i) => {const s=90+i*80;return frame>=s?(<E key={i} d={s} from="up" style={{width:'100%'}}><div style={{display:'flex',alignItems:'center',gap:20,padding:'20px 28px',backgroundColor:C.card,borderRadius:12,borderLeft:`3px solid ${C.accent}`,boxShadow:'0 8px 32px rgba(0,0,0,0.4)'}}><div style={{width:36,height:36,borderRadius:18,background:`${C.accent}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:700,color:C.accent,flexShrink:0}}>{i+1}</div><span style={{fontSize:26,fontWeight:400,color:C.text}}>{item}</span></div></E>):null;})}
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestReveal:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={360} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
