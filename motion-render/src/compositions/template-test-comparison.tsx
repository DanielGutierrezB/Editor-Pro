import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { TrendingDown, TrendingUp } from 'lucide-react';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});const x=from==='left'?interpolate(p,[0,1],[80,0]):from==='right'?interpolate(p,[0,1],[-80,0]):0;return <div style={{opacity:p,transform:`translateX(${x}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _end=Math.max(_fi+1,dur-Math.max(1,fo));return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const LEFT = {title:"Manual",icon:TrendingDown,points:["Sin escalabilidad","Datos imprecisos","Decisiones lentas"],accent:C.red};
const RIGHT = {title:"Automatizado",icon:TrendingUp,points:["Escala infinita","Data en tiempo real","Decisiones rápidas"],accent:C.accent};

const Section1:React.FC = () => {
  const {durationInFrames:dur} = useVideoConfig();
  const card = (side:{title:string;icon:any;points:string[];accent:string},d:number,dir:'left'|'right') => {
    const Icon = side.icon;
    return (
      <E d={d} from={dir} style={{flex:1,maxWidth:620}}>
        <div style={{background:C.card,borderRadius:16,padding:32,border:`1px solid ${side.accent}30`,boxShadow:`0 8px 32px rgba(0,0,0,0.4)`,height:'100%'}}>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
            <div style={{width:48,height:48,borderRadius:24,background:`${side.accent}15`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <Icon size={24} color={side.accent} strokeWidth={2}/>
            </div>
            <div style={{fontSize:32,fontWeight:700,color:side.accent}}>{side.title}</div>
          </div>
          {side.points.map((pt,i) => (
            <E key={i} d={d+15+i*8} from="up">
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
                <div style={{width:8,height:8,borderRadius:4,backgroundColor:side.accent,flexShrink:0}}/>
                <div style={{fontSize:22,color:C.text}}>{pt}</div>
              </div>
            </E>
          ))}
        </div>
      </E>
    );
  };
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center',alignItems:'stretch',flexDirection:'row',gap:40}}>
        {card(LEFT,5,'left')}
        <E d={15} from="pop" style={{display:'flex',alignItems:'center'}}>
          <div style={{width:2,height:200,backgroundColor:C.border}}/>
        </E>
        {card(RIGHT,10,'right')}
      </Safe>
    </Fd>
  );
};

export const TemplateTestComparison:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
