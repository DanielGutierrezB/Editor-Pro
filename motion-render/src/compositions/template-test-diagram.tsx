import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Globe, Server, Database, ChevronRight } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${from==='up'?interpolate(p,[0,1],[60,0]):0}px) scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Arquitectura del Sistema";
const NODES = [{Icon:Globe,title:"Frontend",desc:"React + Next.js",accent:C.accent},{Icon:Server,title:"API Gateway",desc:"Node.js + Express",accent:C.orange},{Icon:Database,title:"Base de Datos",desc:"PostgreSQL + Redis",accent:C.purple}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:50,textAlign:'center',width:'100%'}}><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,width:'100%'}}>
          {NODES.map((n,i) => {
            const nStart = 20+i*60;
            const isActive = i===Math.min(Math.floor((frame-20)/60),NODES.length-1);
            return frame>=nStart ? (
              <React.Fragment key={i}>
                {i>0 && <E d={nStart} from="pop" style={{flexShrink:0}}><div style={{display:'flex',alignItems:'center'}}><div style={{width:40,height:2,background:`linear-gradient(90deg,${NODES[i-1].accent}60,${n.accent})`}}/><ChevronRight size={20} color={n.accent}/></div></E>}
                <E d={nStart+5} from="pop" style={{flex:1,maxWidth:360}}>
                  <div style={{background:C.card,borderRadius:16,padding:28,border:`1px solid ${isActive?n.accent+'40':C.border}`,boxShadow:isActive?`0 0 20px ${n.accent}15, 0 8px 32px rgba(0,0,0,0.4)`:'0 8px 32px rgba(0,0,0,0.3)',textAlign:'center'}}>
                    <div style={{width:64,height:64,borderRadius:32,background:`${n.accent}15`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}><n.Icon size={32} color={n.accent}/></div>
                    <div style={{fontSize:24,fontWeight:700,color:C.text,marginBottom:8}}>{n.title}</div>
                    <div style={{fontSize:18,color:C.dim}}>{n.desc}</div>
                  </div>
                </E>
              </React.Fragment>
            ):null;
          })}
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestDiagram:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
