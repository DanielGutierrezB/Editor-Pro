import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { TrendingUp, Target, DollarSign, BarChart3 } from 'lucide-react';

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', green:'#0ae98d',
  orange:'#fb923c', purple:'#a78bfa', red:'#f87171', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(10,233,141,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const MetricIcon:React.FC<{icon:React.ReactNode;label:string;position:{x:number;y:number};d:number}> = ({icon,label,position,d}) => (
  <E d={d} from="pop" style={{position:'absolute', left:position.x, top:position.y}}>
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
      <div style={{width:80,height:80,borderRadius:40,background:C.card,border:`1px solid ${C.accent}`,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:`0 0 20px ${C.glow}`}}>
        {icon}
      </div>
      <div style={{fontSize:16,fontWeight:700,color:C.accent,fontFamily:"'DM Sans',sans-serif"}}>{label}</div>
    </div>
  </E>
);

const Section1:React.FC = () => (
  <Fd dur={75} fi={10} fo={10}>
    <Safe>
      <E d={0} from="pop">
        <div style={{width:120,height:120,borderRadius:60,background:C.accent,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:40}}>
          <BarChart3 size={60} color={C.bg} strokeWidth={2} />
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:60,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif",marginBottom:16}}>
          Storytelling con Data
        </div>
      </E>
      <E d={25} from="up">
        <div style={{fontSize:28,fontWeight:400,color:C.dim,textAlign:'center',fontFamily:"'DM Sans',sans-serif",marginBottom:30}}>
          Métricas y reportes
        </div>
      </E>
      <E d={35} from="pop">
        <div style={{width:60,height:3,background:C.accent,borderRadius:2}} />
      </E>
    </Safe>
  </Fd>
);

const Section2:React.FC = () => (
  <Fd dur={138} fi={10} fo={1}>
    <Safe>
      <E d={0} from="up" style={{marginBottom:60}}>
        <div style={{fontSize:48,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          Ya conoces las métricas clave
        </div>
      </E>
      
      <div style={{position:'relative',width:800,height:400}}>
        <MetricIcon 
          icon={<Target size={40} color={C.accent} strokeWidth={2} />}
          label="CTR"
          position={{x:100, y:50}}
          d={20}
        />
        <MetricIcon 
          icon={<DollarSign size={40} color={C.orange} strokeWidth={2} />}
          label="CPA"
          position={{x:350, y:120}}
          d={35}
        />
        <MetricIcon 
          icon={<TrendingUp size={40} color={C.purple} strokeWidth={2} />}
          label="ROAS"
          position={{x:600, y:80}}
          d={50}
        />
        
        <E d={65} from="up" style={{position:'absolute',left:250,top:280}}>
          <div style={{fontSize:24,fontWeight:400,color:C.dim,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
            Y sabes leer el funnel completo
          </div>
        </E>
      </div>
    </Safe>
  </Fd>
);

export const M1Title062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={75}>
        <Section1 />
      </Sequence>
      <Sequence from={75} durationInFrames={138}>
        <Section2 />
      </Sequence>
    </AbsoluteFill>
  );
};