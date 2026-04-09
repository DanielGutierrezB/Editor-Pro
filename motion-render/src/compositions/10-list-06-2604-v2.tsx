import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence} from 'remotion';
import { AlertTriangle, BarChart3, FileText, Target, TrendingUp } from 'lucide-react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Rect } from '@remotion/shapes';

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

const IntroSection:React.FC = () => (
  <Fd dur={90} fi={10} fo={10}>
    <Safe style={{gap:30}}>
      <E d={0} from="pop">
        <div style={{width:120, height:120, borderRadius:60, background:C.card, border:`2px solid ${C.red}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${C.red}22`}}>
          <AlertTriangle size={60} color={C.red} strokeWidth={2} />
        </div>
      </E>
      <E d={15} from="up">
        <div style={{fontSize:56, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          5 Errores Críticos
        </div>
      </E>
      <E d={25} from="up">
        <div style={{fontSize:24, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Que tienes que evitar
        </div>
      </E>
    </Safe>
  </Fd>
);

const ListItem:React.FC<{number:number; icon:React.ReactNode; title:string; desc:string; d:number; accent:string}> = ({number,icon,title,desc,d,accent}) => {
  const frame = useCurrentFrame();
  const progress = spring({frame:frame-d-20,fps:30,config:{damping:16,mass:0.5}});
  const highlightWidth = interpolate(progress,[0,1],[0,100]);
  
  return (
    <E d={d} from="up" style={{width:'100%', maxWidth:1400}}>
      <div style={{position:'relative', background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:32, display:'flex', alignItems:'center', gap:24, boxShadow:`0 8px 24px ${C.glow}`}}>
        <Rect
          width={highlightWidth}
          height={120}
          fill={`${accent}15`}
          style={{position:'absolute', left:0, top:0, borderRadius:'12px 0 0 12px'}}
        />
        <div style={{width:80, height:80, borderRadius:40, background:accent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:700, color:C.bg, fontFamily:"'DM Sans',sans-serif", position:'relative', zIndex:1}}>
          {number}
        </div>
        <div style={{width:80, height:80, borderRadius:40, background:`${accent}20`, border:`2px solid ${accent}`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:1}}>
          {icon}
        </div>
        <div style={{flex:1, position:'relative', zIndex:1}}>
          <div style={{fontSize:28, fontWeight:700, color:C.text, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
            {title}
          </div>
          <div style={{fontSize:20, color:C.dim, lineHeight:1.4, fontFamily:"'DM Sans',sans-serif"}}>
            {desc}
          </div>
        </div>
      </div>
    </E>
  );
};

const ListSection:React.FC = () => (
  <Fd dur={567} fi={10} fo={1}>
    <Safe style={{gap:20, justifyContent:'flex-start', paddingTop:40}}>
      <ListItem 
        number={1}
        icon={<BarChart3 size={40} color={C.orange} strokeWidth={2} />}
        title="Listar métricas sin significado"
        desc="Mostrar números sin explicar qué representan o por qué importan"
        d={0}
        accent={C.orange}
      />
      <ListItem 
        number={2}
        icon={<FileText size={40} color={C.purple} strokeWidth={2} />}
        title="Conclusiones sin datos de soporte"
        desc="Dar conclusiones sin mostrar los datos que las respaldan"
        d={90}
        accent={C.purple}
      />
      <ListItem 
        number={3}
        icon={<AlertTriangle size={40} color={C.red} strokeWidth={2} />}
        title="Problemas sin acciones concretas"
        desc="Hablar de un problema sin proponer una acción específica"
        d={180}
        accent={C.red}
      />
      <ListItem 
        number={4}
        icon={<Target size={40} color={C.accent} strokeWidth={2} />}
        title="Actuar en lugar equivocado del funnel"
        desc="Optimizar en el punto incorrecto del embudo de conversión"
        d={270}
        accent={C.accent}
      />
      <ListItem 
        number={5}
        icon={<TrendingUp size={40} color={C.orange} strokeWidth={2} />}
        title="No conectar Meta con negocio"
        desc="No relacionar lo que pasa en Meta con el impacto en el negocio"
        d={360}
        accent={C.orange}
      />
    </Safe>
  </Fd>
);

export const M10List062604V2:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90}>
          <IntroSection />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={567}>
          <ListSection />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};