import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { XCircle, CheckCircle } from 'lucide-react';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});const x=from==='left'?interpolate(p,[0,1],[80,0]):from==='right'?interpolate(p,[0,1],[-80,0]):0;return <div style={{opacity:p,transform:`translateX(${x}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _end=Math.max(_fi+1,dur-Math.max(1,fo));return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const BEFORE = {label:"ANTES",items:["Segmentación manual","Sin datos claros","Presupuesto al azar"]};
const AFTER = {label:"AHORA",items:["Algoritmo inteligente","Data en tiempo real","Inversión optimizada"]};

const Section1:React.FC = () => {
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center',alignItems:'stretch',flexDirection:'row',gap:40}}>
        <E d={5} from="left" style={{flex:1,maxWidth:620}}>
          <div style={{background:C.card,borderRadius:16,padding:32,borderLeft:`4px solid ${C.red}`,height:'100%'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
              <XCircle size={28} color={C.red}/>
              <div style={{fontSize:28,fontWeight:700,color:C.red}}>{BEFORE.label}</div>
            </div>
            {BEFORE.items.map((item,i) => (
              <E key={i} d={15+i*8} from="up">
                <div style={{fontSize:22,color:C.dim,marginBottom:16,paddingLeft:40}}>{item}</div>
              </E>
            ))}
          </div>
        </E>
        <E d={15} from="pop" style={{display:'flex',alignItems:'center'}}>
          <div style={{width:2,height:200,backgroundColor:C.border}}/>
        </E>
        <E d={10} from="right" style={{flex:1,maxWidth:620}}>
          <div style={{background:C.card,borderRadius:16,padding:32,borderLeft:`4px solid ${C.accent}`,height:'100%'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
              <CheckCircle size={28} color={C.accent}/>
              <div style={{fontSize:28,fontWeight:700,color:C.accent}}>{AFTER.label}</div>
            </div>
            {AFTER.items.map((item,i) => (
              <E key={i} d={20+i*8} from="up">
                <div style={{fontSize:22,color:C.text,marginBottom:16,paddingLeft:40}}>{item}</div>
              </E>
            ))}
          </div>
        </E>
      </Safe>
    </Fd>
  );
};

export const TemplateTestBeforeafter:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
