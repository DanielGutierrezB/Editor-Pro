import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Quote } from 'lucide-react';

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame-d, [0,20], [0,1], {easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const y = from==='up'?interpolate(p,[0,1],[80,0]):0;
  const sc = from==='pop'?interpolate(p,[0,1],[0.85,1]):1;
  return <div style={{transform:`translateY(${y}px) scale(${sc})`,opacity:p,...style}}>{children}</div>;
};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  const _fi=Math.max(1,fi); const _fo=Math.max(1,fo); const _end=Math.max(_fi+1,dur-_fo);
  return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};
const AnimatedText:React.FC<{text:string;d:number;fontSize?:number;fontWeight?:number;color?:string;mode?:'word'|'fade';framesPerWord?:number}> = ({text,d,fontSize=36,fontWeight=700,color=C.text,mode='word',framesPerWord=4}) => {
  const frame = useCurrentFrame();
  if (mode==='fade') { const p=interpolate(frame-d,[0,25],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'}); return <div style={{fontSize,fontWeight,color,textAlign:'center',opacity:p,transform:`translateY(${interpolate(p,[0,1],[30,0])}px)`}}>{text}</div>; }
  return (<div style={{fontSize,fontWeight,textAlign:'center',display:'flex',flexWrap:'wrap',justifyContent:'center',gap:`0 ${fontSize*0.3}px`}}>
    {text.split(' ').map((w,i) => { const p=interpolate(frame-d-i*framesPerWord,[0,12],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'}); return <span key={i} style={{color,opacity:p,transform:`translateY(${interpolate(p,[0,1],[20,0])}px)`,display:'inline-block'}}>{w}</span>; })}
  </div>);
};
const AccentSeparator:React.FC<{d:number;width?:number;color?:string;variant?:string}> = ({d,width=80,color=C.accent,variant='gradient'}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame-d,[0,25],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <div style={{width:width*p,height:2,margin:'0 auto',background:`linear-gradient(90deg,transparent,${color},transparent)`,borderRadius:1}}/>;
};

const PHRASE = "Criterio > Presupuesto";
const ACCENT = C.accent;

const Section1:React.FC = () => {
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur} fo={1}>
      <div style={{position:'absolute',inset:0,zIndex:-1,background:`radial-gradient(circle at 50% 50%,${ACCENT}06,transparent 70%)`}}/>
      <Safe style={{justifyContent:'center',alignItems:'center'}}>
        <E d={0} from="pop"><Quote size={72} color={ACCENT} strokeWidth={1.5}/></E>
        <div style={{height:32}}/>
        <AccentSeparator d={8} width={80} color={ACCENT}/>
        <div style={{height:28}}/>
        <AnimatedText text={PHRASE} d={15} fontSize={56} fontWeight={700} color={C.text} mode="word" framesPerWord={5}/>
        <div style={{height:28}}/>
        <AccentSeparator d={15+PHRASE.split(' ').length*5+10} width={80} color={ACCENT}/>
      </Safe>
    </Fd>
  );
};

export const TemplateTestCallout:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Sequence from={0} durationInFrames={180} premountFor={10}><Section1/></Sequence>
  </AbsoluteFill>
);
