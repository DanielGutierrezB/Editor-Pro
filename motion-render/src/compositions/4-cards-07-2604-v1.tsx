import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img, getInputProps} from 'remotion';
import { AlertTriangle, Target, Users, DollarSign, ArrowRight } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

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

const ProblemSection:React.FC = () => (
  <Fd dur={150} fi={10} fo={10}>
    <Safe style={{flexDirection:'column', gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Problema: Campañas no gastan
        </div>
      </E>
      <E d={15} from="pop">
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, boxShadow:`0 8px 24px ${C.glow}`, minWidth:800, textAlign:'center'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginBottom:20}}>
            <AlertTriangle size={60} color={C.red} strokeWidth={1.5} />
            <div style={{fontSize:36, fontWeight:700, color:C.red, fontFamily:"'DM Sans',sans-serif"}}>Meta no encuentra oportunidades</div>
          </div>
          <div style={{fontSize:24, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>Las campañas no están gastando el presupuesto asignado</div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const CausesSection:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'row', gap:50, justifyContent:'center'}}>
      <E d={0} from="left" style={{flex:1, maxWidth:550}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.orange}33`, padding:28, boxShadow:`0 8px 24px ${C.orange}15`, textAlign:'center'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16}}>
            <Target size={50} color={C.orange} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Señal</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:12, fontFamily:"'DM Sans',sans-serif"}}>Calidad de la audiencia</div>
          <div style={{height:4, background:C.dim, borderRadius:2, marginBottom:8, opacity:0.4}}></div>
          <div style={{height:4, background:C.dim, borderRadius:2, width:'70%', opacity:0.3}}></div>
        </div>
      </E>
      
      <E d={8} from="pop" style={{alignSelf:'center'}}>
        <ArrowRight size={40} color={C.dim} strokeWidth={2} />
      </E>
      
      <E d={15} from="right" style={{flex:1, maxWidth:550}}>
        <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.purple}33`, padding:28, boxShadow:`0 8px 24px ${C.purple}15`, textAlign:'center'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:16}}>
            <Users size={50} color={C.purple} strokeWidth={1.5} />
            <div style={{fontSize:28, fontWeight:700, color:C.purple, fontFamily:"'DM Sans',sans-serif"}}>Restricciones</div>
          </div>
          <div style={{fontSize:20, color:C.dim, marginBottom:12, fontFamily:"'DM Sans',sans-serif"}}>Limitaciones de targeting</div>
          <div style={{height:4, background:C.dim, borderRadius:2, marginBottom:8, opacity:0.4}}></div>
          <div style={{height:4, background:C.dim, borderRadius:2, width:'60%', opacity:0.3}}></div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const QuestionsSection:React.FC = () => (
  <Fd dur={276} fi={10} fo={1}>
    <Safe style={{flexDirection:'column', gap:50}}>
      <E d={0} from="up">
        <div style={{fontSize:42, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Dos preguntas clave
        </div>
      </E>
      
      <div style={{display:'flex', flexDirection:'row', gap:60, justifyContent:'center'}}>
        <E d={15} from="left" style={{flex:1, maxWidth:650}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.accent}33`, padding:32, boxShadow:`0 8px 24px ${C.accent}15`}}>
            <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
              <DollarSign size={50} color={C.accent} strokeWidth={1.5} />
              <div style={{fontSize:32, fontWeight:700, color:C.accent, fontFamily:"'DM Sans',sans-serif"}}>Presupuesto</div>
            </div>
            <div style={{fontSize:24, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>¿Es viable para el objetivo?</div>
            <div style={{height:4, background:C.dim, borderRadius:2, marginBottom:8, opacity:0.4}}></div>
            <div style={{height:4, background:C.dim, borderRadius:2, width:'80%', marginBottom:8, opacity:0.3}}></div>
            <div style={{height:4, background:C.dim, borderRadius:2, width:'65%', opacity:0.2}}></div>
          </div>
        </E>
        
        <E d={30} from="right" style={{flex:1, maxWidth:650}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.orange}33`, padding:32, boxShadow:`0 8px 24px ${C.orange}15`}}>
            <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
              <Users size={50} color={C.orange} strokeWidth={1.5} />
              <div style={{fontSize:32, fontWeight:700, color:C.orange, fontFamily:"'DM Sans',sans-serif"}}>Segmentación</div>
            </div>
            <div style={{fontSize:24, color:C.text, marginBottom:16, fontFamily:"'DM Sans',sans-serif"}}>¿Está muy segmentado el público?</div>
            <div style={{height:4, background:C.dim, borderRadius:2, marginBottom:8, opacity:0.4}}></div>
            <div style={{height:4, background:C.dim, borderRadius:2, width:'75%', marginBottom:8, opacity:0.3}}></div>
            <div style={{height:4, background:C.dim, borderRadius:2, width:'55%', opacity:0.2}}></div>
          </div>
        </E>
      </div>
    </Safe>
  </Fd>
);

export const M4Cards072604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={150}>
          <ProblemSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <CausesSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={276}>
          <QuestionsSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};