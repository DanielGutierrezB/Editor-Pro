import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
import { TrendingUp, Users, Heart } from 'lucide-react';

const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${from==='up'?interpolate(p,[0,1],[80,0]):0}px) scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {const frame=useCurrentFrame();const _fi=Math.max(1,fi);const _end=Math.max(_fi+1,dur-Math.max(1,fo));return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const METRICS = [
  {value:73,suffix:"%",label:"Conversión",Icon:TrendingUp,accent:C.accent},
  {value:2400,suffix:"",label:"Usuarios",Icon:Users,accent:C.orange},
  {value:98,suffix:"%",label:"Satisfacción",Icon:Heart,accent:C.purple},
];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  return (
    <Fd dur={dur} fo={1}>
      <Safe style={{justifyContent:'center',alignItems:'center'}}>
        <E d={0} from="up" style={{marginBottom:50,textAlign:'center'}}>
          <div style={{fontSize:38,fontWeight:700,color:C.text}}>Resultados del Q4</div>
        </E>
        <div style={{display:'flex',gap:80,justifyContent:'center'}}>
          {METRICS.map((m,i) => {
            const p = interpolate(frame-20-i*12,[0,30],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
            const val = Math.round(interpolate(p,[0,1],[0,m.value]));
            return (
              <E key={i} d={15+i*12} from="up">
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,background:C.card,borderRadius:16,padding:32,border:`1px solid ${m.accent}30`,boxShadow:`0 8px 32px rgba(0,0,0,0.4), 0 0 ${i===0?'30':'0'}px ${m.accent}15`,minWidth:280}}>
                  <m.Icon size={36} color={m.accent} strokeWidth={1.5}/>
                  <div style={{fontSize:72,fontWeight:700,color:m.accent}}>{val}{m.suffix}</div>
                  <div style={{fontSize:18,fontWeight:400,color:C.dim,textTransform:'uppercase',letterSpacing:3}}>{m.label}</div>
                </div>
              </E>
            );
          })}
        </div>
      </Safe>
    </Fd>
  );
};

export const TemplateTestMetrics:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
