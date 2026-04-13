import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { Database, Cpu, BarChart3, ChevronRight } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Pipeline de Datos";
const CARDS = [{Icon:Database,title:"Recolección",desc:"Datos en tiempo real",accent:C.accent},{Icon:Cpu,title:"Procesamiento",desc:"Machine learning",accent:C.orange},{Icon:BarChart3,title:"Insights",desc:"Visualización",accent:C.purple}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:50,textAlign:'center',width:'100%'}}><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <div style={{display:'flex',gap:32,justifyContent:'center',alignItems:'stretch',width:'100%'}}>
          {CARDS.map((c,i) => {
            const s=20+i*30; const isLast=i===CARDS.length-1;
            return (
              <React.Fragment key={i}>
                {i>0 && <E d={s} from="pop" style={{alignSelf:'center',flexShrink:0}}><ChevronRight size={28} color={c.accent}/></E>}
                <E d={s+5} from="up" style={{flex:1,maxWidth:420}}>
                  <div style={{background:C.card,borderRadius:16,padding:28,border:`1px solid ${isLast?c.accent+'40':C.border}`,boxShadow:isLast?`0 0 20px ${c.accent}15, 0 8px 32px rgba(0,0,0,0.4)`:'0 8px 32px rgba(0,0,0,0.3)',textAlign:'center',height:'100%'}}>
                    <div style={{width:64,height:64,borderRadius:32,background:`${c.accent}15`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}><c.Icon size={32} color={c.accent}/></div>
                    <div style={{fontSize:24,fontWeight:700,color:C.text,marginBottom:8}}>{c.title}</div>
                    <div style={{fontSize:18,color:C.dim}}>{c.desc}</div>
                  </div>
                </E>
              </React.Fragment>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestCards:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
