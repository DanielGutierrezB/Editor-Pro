import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "KPIs de Campaña";
const BARS = [{label:"CTR",value:73,target:80,color:C.accent},{label:"Conversión",value:45,target:60,color:C.orange},{label:"Engagement",value:89,target:75,color:C.purple},{label:"Retención",value:62,target:70,color:C.red}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe style={{alignItems:'center'}}>
        <E d={0} from="up" style={{marginBottom:50,textAlign:'center',width:'100%'}}><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <div style={{display:'flex',flexDirection:'column',gap:28,width:'100%',maxWidth:900}}>
          {BARS.map((b,i) => {
            const bp = interpolate(frame-20-i*10,[0,30],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
            const val = Math.round(interpolate(bp,[0,1],[0,b.value]));
            const status = b.value >= b.target ? '✓' : '↑';
            return (
              <E key={i} d={15+i*10} from="up" style={{width:'100%'}}>
                <div style={{display:'flex',alignItems:'center',gap:16,width:'100%'}}>
                  <div style={{fontSize:20,fontWeight:700,color:C.text,width:120}}>{b.label}</div>
                  <div style={{flex:1,height:20,backgroundColor:C.card,borderRadius:10,overflow:'hidden',position:'relative'}}>
                    <div style={{height:'100%',width:`${val}%`,backgroundColor:b.color,borderRadius:10,boxShadow:`0 0 12px ${b.color}30`}}/>
                    {/* Target line */}
                    <div style={{position:'absolute',left:`${b.target}%`,top:-4,bottom:-4,width:2,backgroundColor:C.dim}}/>
                  </div>
                  <div style={{fontSize:22,fontWeight:700,color:b.color,width:60,textAlign:'right'}}>{val}%</div>
                  <div style={{fontSize:18,color:b.value>=b.target?C.accent:C.orange,width:20}}>{status}</div>
                </div>
              </E>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestProgressbars:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
