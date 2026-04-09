import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence, Img} from 'remotion';
import { CheckCircle, ArrowRight, Target, Settings, Zap, TrendingUp } from 'lucide-react';
import { evolvePath } from '@remotion/paths';
import { Circle, Rect } from '@remotion/shapes';

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

const DrawPath:React.FC<{path:string;color:string;strokeWidth?:number;d:number;dur:number}> = ({path,color,strokeWidth=3,d,dur}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, dur], [0, 1], {extrapolateRight:'clamp'});
  const evolution = evolvePath(progress, path);
  return (
    <svg viewBox="0 0 800 400" style={{width:800, height:400}}>
      <path d={path} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeDasharray={evolution.strokeDasharray} strokeDashoffset={evolution.strokeDashoffset} />
    </svg>
  );
};

const TypeText:React.FC<{text:string;d:number;dur:number;style?:React.CSSProperties}> = ({text,d,dur,style}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, dur], [0, 1], {extrapolateRight:'clamp'});
  const chars = Math.round(progress * text.length);
  return <div style={style}>{text.substring(0, chars)}</div>;
};

const StructureSection:React.FC = () => (
  <Fd dur={84} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Estructura de 4 Pasos
        </div>
      </E>
      <E d={20} from="left" style={{width:'100%', maxWidth:1200}}>
        <div style={{display:'flex', gap:40, justifyContent:'center'}}>
          {[
            {icon: <Target size={60} color={C.accent} />, title: "Paso 1", desc: "Identificar"},
            {icon: <Settings size={60} color={C.orange} />, title: "Paso 2", desc: "Estructurar"},
            {icon: <Zap size={60} color={C.purple} />, title: "Paso 3", desc: "Ejecutar"},
            {icon: <CheckCircle size={60} color={C.green} />, title: "Paso 4", desc: "Validar"}
          ].map((step, i) => (
            <E key={i} d={30 + i*10} from="pop">
              <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, width:220, textAlign:'center', boxShadow:`0 8px 24px ${C.glow}`}}>
                <div style={{marginBottom:16, display:'flex', justifyContent:'center'}}>
                  {step.icon}
                </div>
                <div style={{fontSize:20, fontWeight:700, color:C.text, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                  {step.title}
                </div>
                <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                  {step.desc}
                </div>
              </div>
            </E>
          ))}
        </div>
      </E>
    </Safe>
  </Fd>
);

const ErrorsSection:React.FC = () => (
  <Fd dur={90} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.red, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Evitar 5 Errores
        </div>
      </E>
      <E d={20} from="left" style={{width:'100%'}}>
        <div style={{display:'flex', flexDirection:'column', gap:20, maxWidth:1000}}>
          {[
            "No definir objetivos claros",
            "Saltar pasos en el proceso",
            "Ignorar la retroalimentación",
            "No documentar decisiones",
            "Optimizar antes de validar"
          ].map((error, i) => (
            <E key={i} d={30 + i*8} from="left">
              <div style={{display:'flex', alignItems:'center', gap:16, background:C.card, borderRadius:8, padding:16, border:`1px solid ${C.border}`}}>
                <Circle radius={12} fill={C.red} />
                <div style={{fontSize:20, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                  {error}
                </div>
              </div>
            </E>
          ))}
        </div>
      </E>
    </Safe>
  </Fd>
);

const DifferentiationSection:React.FC = () => {
  const connectionPath = "M 100 200 Q 400 100 700 200";
  
  return (
    <Fd dur={90} fi={10} fo={10}>
      <Safe style={{gap:40}}>
        <E d={0} from="up">
          <div style={{fontSize:56, fontWeight:700, color:C.accent, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
            = Diferenciación
          </div>
        </E>
        <E d={20} from="pop" style={{position:'relative'}}>
          <div style={{display:'flex', alignItems:'center', gap:60}}>
            <div style={{background:C.card, borderRadius:12, padding:24, border:`2px solid ${C.accent}`, textAlign:'center'}}>
              <div style={{fontSize:24, fontWeight:700, color:C.accent, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                4 Pasos
              </div>
              <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                Estructura
              </div>
            </div>
            <div style={{fontSize:40, color:C.text, fontWeight:700, fontFamily:"'DM Sans',sans-serif"}}>+</div>
            <div style={{background:C.card, borderRadius:12, padding:24, border:`2px solid ${C.red}`, textAlign:'center'}}>
              <div style={{fontSize:24, fontWeight:700, color:C.red, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                5 Errores
              </div>
              <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                Evitados
              </div>
            </div>
            <ArrowRight size={40} color={C.accent} />
            <div style={{background:`linear-gradient(135deg, ${C.accent}, ${C.purple})`, borderRadius:12, padding:24, textAlign:'center'}}>
              <div style={{fontSize:28, fontWeight:700, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
                Diferenciación
              </div>
            </div>
          </div>
        </E>
        <E d={60} from="up">
          <div style={{fontSize:18, color:C.dim, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
            Muy poca gente hace esto bien
          </div>
        </E>
      </Safe>
    </Fd>
  );
};

const NextClassSection:React.FC = () => (
  <Fd dur={120} fi={10} fo={10}>
    <Safe style={{gap:40}}>
      <E d={0} from="up">
        <div style={{fontSize:48, fontWeight:700, color:C.text, textAlign:'center', fontFamily:"'DM Sans',sans-serif"}}>
          Siguiente Clase
        </div>
      </E>
      <E d={20} from="left" style={{width:'100%', maxWidth:1200}}>
        <div style={{display:'flex', flexDirection:'column', gap:24}}>
          <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, boxShadow:`0 8px 24px ${C.glow}`}}>
            <div style={{fontSize:24, fontWeight:700, color:C.accent, marginBottom:12, fontFamily:"'DM Sans',sans-serif"}}>
              Sistema de Decisión Completo
            </div>
            <div style={{fontSize:18, color:C.dim, lineHeight:1.6, fontFamily:"'DM Sans',sans-serif"}}>
              Convertir todo esto en un sistema operativo real
            </div>
          </div>
          <div style={{display:'flex', gap:24}}>
            <E d={40} from="left" style={{flex:1}}>
              <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:20}}>
                <div style={{fontSize:20, fontWeight:700, color:C.orange, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                  Árbol de Decisión Real
                </div>
                <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                  Estructura práctica
                </div>
              </div>
            </E>
            <E d={55} from="up" style={{flex:1}}>
              <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:20}}>
                <div style={{fontSize:20, fontWeight:700, color:C.purple, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                  SOP Operativo
                </div>
                <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                  Procedimientos claros
                </div>
              </div>
            </E>
            <E d={70} from="right" style={{flex:1}}>
              <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:20}}>
                <div style={{fontSize:20, fontWeight:700, color:C.green, marginBottom:8, fontFamily:"'DM Sans',sans-serif"}}>
                  Optimización Segura
                </div>
                <div style={{fontSize:16, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
                  Sin romper lo que funciona
                </div>
              </div>
            </E>
          </div>
        </div>
      </E>
    </Safe>
  </Fd>
);

const OperationSection:React.FC = () => {
  const frame = useCurrentFrame();
  const pulseScale = 1 + Math.sin(frame * 0.1) * 0.05;
  
  return (
    <Fd dur={81} fi={10} fo={1}>
      <Safe>
        <E d={0} from="pop">
          <div style={{textAlign:'center', transform:`scale(${pulseScale})`}}>
            <div style={{fontSize:80, fontWeight:700, color:C.accent, marginBottom:20, fontFamily:"'DM Sans',sans-serif", textShadow:`0 0 30px ${C.accent}44`}}>
              OPERACIÓN
            </div>
            <div style={{fontSize:24, color:C.dim, fontFamily:"'DM Sans',sans-serif"}}>
              Donde todo se convierte en realidad
            </div>
          </div>
        </E>
        <E d={30} from="up" style={{position:'absolute', bottom:40, left:'50%', transform:'translateX(-50%)'}}>
          <div style={{display:'flex', alignItems:'center', gap:12, background:C.card, borderRadius:8, padding:12, border:`1px solid ${C.border}`}}>
            <TrendingUp size={20} color={C.accent} />
            <div style={{fontSize:16, color:C.text, fontFamily:"'DM Sans',sans-serif"}}>
              Sistema completo en acción
            </div>
          </div>
        </E>
      </Safe>
    </Fd>
  );
};

export const M11Reveal062604V1:React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <Sequence from={0} durationInFrames={84}>
        <StructureSection />
      </Sequence>
      <Sequence from={84} durationInFrames={90}>
        <ErrorsSection />
      </Sequence>
      <Sequence from={174} durationInFrames={90}>
        <DifferentiationSection />
      </Sequence>
      <Sequence from={264} durationInFrames={120}>
        <NextClassSection />
      </Sequence>
      <Sequence from={384} durationInFrames={81}>
        <OperationSection />
      </Sequence>
    </AbsoluteFill>
  );
};