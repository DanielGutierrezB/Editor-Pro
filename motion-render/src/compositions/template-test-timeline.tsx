import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Flag, Rocket, Star, Trophy } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const EVENTS = [{Icon:Flag,label:"Inicio",time:"Sem 1",accent:C.accent},{Icon:Rocket,label:"Lanzamiento",time:"Sem 4",accent:C.orange},{Icon:Star,label:"Optimización",time:"Sem 8",accent:C.purple},{Icon:Trophy,label:"Resultados",time:"Sem 12",accent:C.accent}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  const lineW = interpolate(frame,[10,120],[0,100],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return (
    <Fd dur={dur}>
      <Safe style={{justifyContent:'center'}}>
        <div style={{position:'relative',width:'100%',maxWidth:1200,height:300}}>
          {/* Horizontal line */}
          <div style={{position:'absolute',top:80,left:0,right:0,height:3,backgroundColor:C.border}}>
            <div style={{height:'100%',width:`${lineW}%`,backgroundColor:C.accent,borderRadius:2}}/>
          </div>
          {/* Events */}
          <div style={{display:'flex',justifyContent:'space-between',position:'relative'}}>
            {EVENTS.map((ev,i) => {
              const evStart = 15+i*25;
              return (
                <E key={i} d={evStart} from="pop" style={{display:'flex',flexDirection:'column',alignItems:'center',width:140}}>
                  <div style={{width:80,height:80,borderRadius:40,background:C.card,border:`2px solid ${ev.accent}`,boxShadow:`0 0 20px ${ev.accent}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16,zIndex:1}}>
                    <ev.Icon size={36} color={ev.accent}/>
                  </div>
                  <div style={{fontSize:20,fontWeight:700,color:C.text,textAlign:'center'}}>{ev.label}</div>
                  <div style={{fontSize:16,color:C.dim,marginTop:4}}>{ev.time}</div>
                </E>
              );
            })}
          </div>
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestTimeline:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
