import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Easing} from 'remotion';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${from==='up'?interpolate(p,[0,1],[80,0]):0}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _end=Math.max(_fi+1,dur-Math.max(1,fo));return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Inversión por Plataforma";
const SUBTITLE = "Distribución Q4 2024";
const BARS = [{label:"Meta",value:45,color:C.accent},{label:"Google",value:32,color:C.orange},{label:"TikTok",value:18,color:C.purple},{label:"LinkedIn",value:12,color:C.red}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {fps,durationInFrames:dur} = useVideoConfig();
  const maxVal = Math.max(...BARS.map(b=>b.value));
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'space-between',alignItems:'center'}}>
        <div style={{textAlign:'center',marginBottom:40,width:'100%'}}>
          <E d={0} from="up"><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
          <E d={8} from="up"><div style={{fontSize:22,color:C.dim,marginTop:8}}>{SUBTITLE}</div></E>
        </div>
        <div style={{display:'flex',gap:40,alignItems:'flex-end',justifyContent:'center'}}>
          {BARS.map((b,i) => {
            const bp = spring({frame:frame-25-i*8,fps,config:{damping:18,mass:0.5,stiffness:80}});
            const h = interpolate(bp,[0,1],[0,(b.value/maxVal)*380],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
            const cv = Math.round(interpolate(bp,[0,1],[0,b.value],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}));
            return (
              <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                <div style={{fontSize:24,fontWeight:700,color:b.color,opacity:interpolate(bp,[0.3,0.6],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>{cv}%</div>
                <div style={{width:120,height:h,borderRadius:'8px 8px 4px 4px',backgroundColor:b.color,boxShadow:`0 0 20px ${b.color}20`}}/>
                <div style={{fontSize:18,fontWeight:700,color:C.dim,marginTop:4,opacity:interpolate(bp,[0,0.3],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>{b.label}</div>
              </div>
            );
          })}
        </div>
        <div style={{width:800,height:2,backgroundColor:C.border}}/>
      </Safe>
    </Fd>
  );
};

export const TemplateTestChart:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
