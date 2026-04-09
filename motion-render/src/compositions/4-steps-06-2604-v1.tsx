import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { BarChart3, Search, Lightbulb, Zap } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

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

const ProgressDots:React.FC<{current:number;total:number;d:number}> = ({current,total,d}) => (
  <E d={d} from="right" style={{display:'flex',flexDirection:'column',gap:20,justifyContent:'center'}}>
    {Array.from({length:total}).map((_,i) => (
      <div key={i} style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{
          width:16,height:16,borderRadius:8,
          background: i < current ? C.accent : i === current ? C.accent : 'transparent',
          border: i === current ? `2px solid ${C.accent}` : `1px solid ${C.dim}`,
          boxShadow: i === current ? `0 0 12px ${C.accent}44` : 'none'
        }} />
        <span style={{fontSize:16,color:i === current ? C.text : C.dim,fontWeight:i === current ? 700 : 400,fontFamily:"'DM Sans',sans-serif"}}>
          {i === 0 ? 'Contexto' : i === 1 ? 'Hallazgo' : i === 2 ? 'Interpretación' : 'Acción'}
        </span>
      </div>
    ))}
  </E>
);

const TitleSection:React.FC = () => (
  <Fd dur={135} fi={10} fo={10}>
    <Safe>
      <E d={0} from="up">
        <div style={{fontSize:52,fontWeight:700,color:C.text,textAlign:'center',marginBottom:20,fontFamily:"'DM Sans',sans-serif"}}>
          La estructura que funciona siempre
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:24,color:C.dim,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          4 pasos para análisis efectivo
        </div>
      </E>
    </Safe>
  </Fd>
);

const Step1Section:React.FC = () => (
  <Fd dur={210} fi={10} fo={10}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:140,height:140,borderRadius:70,background:C.card,
          border:`2px solid ${C.accent}`,display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${C.accent}22`
        }}>
          <BarChart3 size={80} color={C.accent} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:38,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          1. CONTEXTO
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Qué estás viendo y en qué período
        </div>
        <E d={30} from="up">
          <div style={{
            background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
            padding:24,marginTop:20,maxWidth:480
          }}>
            <div style={{fontSize:18,color:C.text,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
              Ejemplo:
            </div>
            <div style={{fontSize:16,color:C.dim,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>
              CTR está en <span style={{color:C.orange,fontWeight:600}}>0.6%</span> por debajo del <span style={{color:C.accent,fontWeight:600}}>1%</span> que normalmente genera esta cuenta
            </div>
          </div>
        </E>
      </E>
      <ProgressDots current={0} total={4} d={15} />
    </Safe>
  </Fd>
);

const Step2Section:React.FC = () => (
  <Fd dur={180} fi={10} fo={10}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:140,height:140,borderRadius:70,background:C.card,
          border:`2px solid ${C.orange}`,display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${C.orange}22`
        }}>
          <Search size={80} color={C.orange} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:38,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          2. HALLAZGO
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Identificación del problema específico
        </div>
        <E d={25} from="up">
          <div style={{
            background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
            padding:24,marginTop:20,maxWidth:480
          }}>
            <div style={{fontSize:18,color:C.text,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
              Observación:
            </div>
            <div style={{fontSize:16,color:C.dim,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>
              El rendimiento está por debajo de lo esperado en métricas clave
            </div>
          </div>
        </E>
      </E>
      <ProgressDots current={1} total={4} d={15} />
    </Safe>
  </Fd>
);

const Step3Section:React.FC = () => (
  <Fd dur={240} fi={10} fo={10}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:140,height:140,borderRadius:70,background:C.card,
          border:`2px solid ${C.purple}`,display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${C.purple}22`
        }}>
          <Lightbulb size={80} color={C.purple} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:38,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          3. INTERPRETACIÓN
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Por qué crees que está pasando eso
        </div>
        <E d={30} from="up">
          <div style={{
            background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
            padding:24,marginTop:20,maxWidth:480
          }}>
            <div style={{fontSize:18,color:C.text,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
              Hipótesis:
            </div>
            <div style={{fontSize:16,color:C.dim,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>
              El creativo tiene más de <span style={{color:C.purple,fontWeight:600}}>3 semanas</span> activo. Probablemente está entrando en fatiga
            </div>
          </div>
        </E>
      </E>
      <ProgressDots current={2} total={4} d={15} />
    </Safe>
  </Fd>
);

const Step4Section:React.FC = () => (
  <Fd dur={270} fi={10} fo={1}>
    <Safe style={{flexDirection:'row',gap:80}}>
      <E d={0} from="left" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:24}}>
        <div style={{
          width:140,height:140,borderRadius:70,background:C.card,
          border:`2px solid ${C.green}`,display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:`0 0 30px ${C.green}22`
        }}>
          <Zap size={80} color={C.green} strokeWidth={1.5} />
        </div>
        <div style={{fontSize:38,fontWeight:700,color:C.text,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}>
          4. ACCIÓN
        </div>
        <div style={{fontSize:20,color:C.dim,textAlign:'center',maxWidth:500,fontFamily:"'DM Sans',sans-serif"}}>
          Qué vas a hacer al respecto
        </div>
        <E d={30} from="up">
          <div style={{
            background:C.card,borderRadius:12,border:`1px solid ${C.border}`,
            padding:24,marginTop:20,maxWidth:480
          }}>
            <div style={{fontSize:18,color:C.text,fontWeight:600,marginBottom:12,fontFamily:"'DM Sans',sans-serif"}}>
              Plan de acción:
            </div>
            <div style={{fontSize:16,color:C.dim,lineHeight:1.6,fontFamily:"'DM Sans',sans-serif"}}>
              Duplicar el asset y probar <span style={{color:C.green,fontWeight:600}}>2 nuevos creativos</span> con hooks distintos esta semana
            </div>
          </div>
        </E>
      </E>
      <ProgressDots current={3} total={4} d={15} />
    </Safe>
  </Fd>
);

export const M4Steps062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={135}>
          <TitleSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={210}>
          <Step1Section />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <Step2Section />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={240}>
          <Step3Section />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={270}>
          <Step4Section />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};