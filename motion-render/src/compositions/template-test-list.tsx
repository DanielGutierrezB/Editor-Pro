import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { CheckCircle } from 'lucide-react';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60+0*15,0])}px)`,filter:`blur(${interpolate(p,[0,0.5,1],[4,1,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Al final del curso podrás";
const ITEMS = ["Lanzar campañas con framework claro","Diagnosticar problemas rápidamente","Escalar cuando el sistema esté listo","Crear reportes profesionales","Tomar decisiones basadas en datos"];

const Section1:React.FC = () => {
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe style={{alignItems:'flex-start'}}>
        <E d={0} from="up" style={{marginBottom:40,width:'100%',textAlign:'center'}}>
          <div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div>
        </E>
        <div style={{display:'flex',flexDirection:'column',gap:16,width:'100%',maxWidth:900}}>
          {ITEMS.map((item,i) => (
            <E key={i} d={20+i*10} from="up" style={{width:'100%'}}>
              <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 24px',backgroundColor:C.card,borderRadius:12,borderLeft:`3px solid ${C.accent}`}}>
                <CheckCircle size={24} color={C.accent} strokeWidth={2}/>
                <span style={{fontSize:24,fontWeight:400,color:C.text}}>{item}</span>
              </div>
            </E>
          ))}
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestList:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
