import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, getInputProps} from 'remotion';
import { X, AlertTriangle, DollarSign, Target, TrendingDown } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { evolvePath } from '@remotion/paths';
import { Trail } from '@remotion/motion-blur';

const _static = (getInputProps() as any).staticPreview === true;

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
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = spring({frame:frame-d,fps,config:{damping:14,mass:0.4}});
  const y = from==='up'?interpolate(progress,[0,1],[200,0]):from==='down'?interpolate(progress,[0,1],[-200,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[200,0]):from==='right'?interpolate(progress,[0,1],[-200,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.9,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:interpolate(progress,[0,0.3],[0,1],{extrapolateRight:'clamp'}),...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;
  const frame = useCurrentFrame();
  return <div style={{opacity:interpolate(frame,[0,fi,dur-fo,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const RuleReveal:React.FC = () => {
  const frame = useCurrentFrame();
  
  // Draw-on effect for the "NO" X
  const xPath = "M 20 20 L 60 60 M 60 20 L 20 60";
  const evolution = evolvePath(Math.min(frame / 45, 1), xPath);
  
  return (
    <Safe>
      <E d={0} from="pop" style={{marginBottom:40}}>
        <div style={{fontSize:64, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          La regla es la misma
        </div>
      </E>
      
      <E d={20} from="up" style={{display:'flex', alignItems:'center', gap:30, marginBottom:60}}>
        <div style={{position:'relative', width:200, height:120, background:C.card, borderRadius:12, border:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 8px 24px ${C.glow}`}}>
          <Target size={50} color={C.accent} strokeWidth={2} />
          <div style={{position:'absolute', bottom:8, fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>Campaña</div>
          
          {/* Animated X overlay */}
          <div style={{position:'absolute', top:-10, right:-10, width:80, height:80, background:C.red, borderRadius:40, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.red}44`}}>
            <svg width="80" height="80" viewBox="0 0 80 80" style={{position:'absolute'}}>
              <path 
                d={xPath} 
                stroke="#ffffff" 
                strokeWidth={4} 
                strokeLinecap="round"
                fill="none"
                strokeDasharray={evolution.strokeDasharray}
                strokeDashoffset={evolution.strokeDashoffset}
              />
            </svg>
          </div>
        </div>
        
        <div style={{fontSize:48, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>
          NO TOQUES
        </div>
      </E>
    </Safe>
  );
};

const FixExternal:React.FC = () => {
  return (
    <Safe>
      <E d={0} from="left" style={{marginBottom:50}}>
        <div style={{fontSize:56, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Arregla primero
        </div>
      </E>
      
      <E d={15} from="right" style={{marginBottom:40}}>
        <div style={{fontSize:32, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          lo que está fuera de Meta
        </div>
      </E>
      
      <E d={30} from="up" style={{display:'flex', gap:60, alignItems:'center'}}>
        <div style={{width:180, height:180, borderRadius:90, background:C.card, border:`2px solid ${C.orange}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.orange}22`}}>
          <AlertTriangle size={80} color={C.orange} strokeWidth={2} />
        </div>
        
        <div style={{fontSize:24, color:C.dim, maxWidth:400, fontFamily:"'DM Sans',sans-serif"}}>
          Sitio web, landing page, pixel de seguimiento, audiencias...
        </div>
      </E>
    </Safe>
  );
};

const WastedBudget:React.FC = () => {
  const frame = useCurrentFrame();
  
  return (
    <Safe>
      <E d={0} from="pop" style={{marginBottom:50}}>
        <div style={{fontSize:40, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Si tocas la campaña antes de arreglar esto
        </div>
      </E>
      
      <E d={20} from="up" style={{display:'flex', alignItems:'center', gap:40, marginBottom:40}}>
        <div style={{width:160, height:160, borderRadius:80, background:C.red, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.red}33`}}>
          <DollarSign size={80} color="#ffffff" strokeWidth={2} />
        </div>
        
        <div style={{fontSize:20, color:C.red, transform:`rotate(${Math.sin(frame * 0.1) * 2}deg)`, fontFamily:"'DM Sans',sans-serif"}}>
          DESPERDICIO
        </div>
        
        <div style={{width:160, height:160, borderRadius:80, background:C.orange, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.orange}33`}}>
          <TrendingDown size={80} color="#ffffff" strokeWidth={2} />
        </div>
      </E>
      
      <E d={40} from="down">
        <div style={{fontSize:48, fontWeight:700, color:C.red, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          MÁS PRESUPUESTO
        </div>
      </E>
    </Safe>
  );
};

export const M7Reveal072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={81}>
          <Fd dur={81} fi={10} fo={12}>
            <RuleReveal />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={93}>
          <Fd dur={93} fi={10} fo={12}>
            <FixExternal />
          </Fd>
        </TransitionSeries.Sequence>
        
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        
        <TransitionSeries.Sequence durationInFrames={180}>
          <Fd dur={180} fi={10} fo={1}>
            <Trail layers={6} lagInFrames={0.02}>
              <WastedBudget />
            </Trail>
          </Fd>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};