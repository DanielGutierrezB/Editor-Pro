import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',text:'#ffffff',dim:'rgba(255,255,255,0.55)',border:'rgba(255,255,255,0.08)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px)`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Evolución del ROAS";
const POINTS = [{label:"Ene",value:1.2},{label:"Feb",value:1.8},{label:"Mar",value:1.5},{label:"Abr",value:2.4},{label:"May",value:3.1},{label:"Jun",value:2.8}];

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  const chartW = 1100; const chartH = 400; const padL = 80; const padB = 50;
  const maxVal = Math.max(...POINTS.map(p=>p.value));
  const drawProgress = interpolate(frame-30,[0,60],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const pts = POINTS.map((p,i) => ({x: padL + (i/(POINTS.length-1))*(chartW-padL-40), y: chartH-padB - (p.value/maxVal)*(chartH-padB-40)}));
  const pathD = pts.map((p,i) => `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
  const totalLen = pts.reduce((acc,p,i) => i===0?0:acc+Math.sqrt(Math.pow(p.x-pts[i-1].x,2)+Math.pow(p.y-pts[i-1].y,2)),0);

  return (
    <Fd dur={dur}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:30,textAlign:'center',width:'100%'}}><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <svg width={chartW} height={chartH} style={{overflow:'visible'}}>
          {/* Y axis */}
          <line x1={padL} y1={20} x2={padL} y2={chartH-padB} stroke={C.border} strokeWidth={1}/>
          {/* X axis */}
          <line x1={padL} y1={chartH-padB} x2={chartW-20} y2={chartH-padB} stroke={C.border} strokeWidth={1}/>
          {/* Grid lines */}
          {[0.25,0.5,0.75,1].map((pct,i) => {
            const y = chartH-padB-(pct*(chartH-padB-40));
            return <line key={i} x1={padL} y1={y} x2={chartW-20} y2={y} stroke={C.border} strokeWidth={0.5} strokeDasharray="4 4"/>;
          })}
          {/* Line */}
          <path d={pathD} fill="none" stroke={C.accent} strokeWidth={3} strokeLinecap="round" strokeDasharray={totalLen} strokeDashoffset={totalLen*(1-drawProgress)}/>
          {/* Points */}
          {pts.map((p,i) => {
            const pointP = interpolate(frame-30-i*8,[0,15],[0,1],{easing:Easing.bezier(0.34,1.56,0.64,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
            return <React.Fragment key={i}>
              <circle cx={p.x} cy={p.y} r={6*pointP} fill={C.accent} stroke={C.bg} strokeWidth={2}/>
              <text x={p.x} y={p.y-16} textAnchor="middle" fill={C.accent} fontSize={18} fontWeight={700} fontFamily="DM Sans" opacity={pointP}>{POINTS[i].value}x</text>
              <text x={p.x} y={chartH-padB+25} textAnchor="middle" fill={C.dim} fontSize={16} fontFamily="DM Sans" opacity={pointP}>{POINTS[i].label}</text>
            </React.Fragment>;
          })}
        </svg>
      </Safe>
    </Fd>
  );
};
export const TemplateTestLinechart:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
