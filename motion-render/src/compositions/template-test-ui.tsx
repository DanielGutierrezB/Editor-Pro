import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Configuración de Campaña";
const FIELDS = [{label:"Nombre",value:"Campaña Q4 2024"},{label:"Presupuesto diario",value:"$150.00"},{label:"Objetivo",value:"Conversiones"}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur}>
      <Safe style={{justifyContent:'center',alignItems:'center'}}>
        <E d={0} from="up" style={{marginBottom:40,textAlign:'center'}}><div style={{fontSize:36,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <E d={10} from="up" style={{width:'100%',maxWidth:560}}>
          <div style={{background:C.card,borderRadius:16,padding:32,boxShadow:'0 16px 48px rgba(0,0,0,0.5)',border:`1px solid ${C.border}`}}>
            {FIELDS.map((f,i) => {
              const typing = interpolate(frame-30-i*20,[0,30],[0,f.value.length],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
              const isActive = i===Math.min(Math.floor((frame-20)/40),FIELDS.length-1);
              return (
                <E key={i} d={20+i*15} from="up" style={{marginBottom:i<FIELDS.length-1?20:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.dim,marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>{f.label}</div>
                  <div style={{height:52,borderRadius:8,border:`1px solid ${isActive?C.accent:C.border}`,boxShadow:isActive?`0 0 0 2px ${C.accent}30`:'none',display:'flex',alignItems:'center',padding:'0 16px',backgroundColor:'rgba(0,0,0,0.2)'}}>
                    <span style={{fontSize:18,color:C.text}}>{f.value.substring(0,Math.round(typing))}</span>
                    {isActive && <span style={{width:2,height:24,backgroundColor:C.accent,marginLeft:2,opacity:frame%30<15?1:0}}/>}
                  </div>
                </E>
              );
            })}
            <E d={70} from="up" style={{marginTop:24}}>
              <div style={{height:48,borderRadius:8,backgroundColor:C.accent,display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:18,fontWeight:700,color:C.bg}}>Crear Campaña</span>
              </div>
            </E>
          </div>
        </E>
      </Safe>
    </Fd>
  );
};
export const TemplateTestUi:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={300} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
