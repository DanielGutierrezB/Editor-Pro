import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Sequence, Easing} from 'remotion';
const C = {bg:'#1a1d23',card:'#2d323a',accent:'#0ae98d',orange:'#fb923c',purple:'#a78bfa',red:'#f87171',text:'#ffffff',dim:'rgba(255,255,255,0.55)'};
const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (<div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>{children}</div>);
const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {const frame=useCurrentFrame();const p=interpolate(frame-d,[0,20],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <div style={{opacity:p,transform:`translateY(${interpolate(p,[0,1],[60,0])}px) scale(${from==='pop'?interpolate(p,[0,1],[0.85,1]):1})`,...style}}>{children}</div>;};
const Fd:React.FC<{children:React.ReactNode;dur:number}> = ({children,dur}) => {const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10,Math.max(11,dur-1),dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;};

const TITLE = "Distribución del Presupuesto";
const SEGMENTS = [{label:"Meta Ads",value:45,color:C.accent},{label:"Google Ads",value:30,color:C.orange},{label:"TikTok",value:15,color:C.purple},{label:"Otros",value:10,color:C.red}];
const TOTAL_LABEL = "Total";

const Section1:React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames:dur} = useVideoConfig();
  const total = SEGMENTS.reduce((a,s)=>a+s.value,0);
  const r = 140; const sw = 28; const cx = 0; const cy = 0;
  const circ = 2*Math.PI*r;
  const drawP = interpolate(frame-20,[0,40],[0,1],{easing:Easing.bezier(0.16,1,0.3,1),extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  let offset = circ*0.25; // start at 12 o'clock

  return (
    <Fd dur={dur}>
      <Safe>
        <E d={0} from="up" style={{marginBottom:40,textAlign:'center',width:'100%'}}><div style={{fontSize:38,fontWeight:700,color:C.text}}>{TITLE}</div></E>
        <div style={{display:'flex',alignItems:'center',gap:80,justifyContent:'center'}}>
          {/* Donut */}
          <E d={10} from="pop">
            <div style={{position:'relative',width:r*2+sw*2,height:r*2+sw*2}}>
              <svg width={r*2+sw*2} height={r*2+sw*2} style={{transform:'rotate(-90deg)'}}>
                {SEGMENTS.map((seg,i) => {
                  const segLen = (seg.value/total)*circ;
                  const thisOffset = offset;
                  offset -= segLen*drawP;
                  return <circle key={i} cx={r+sw} cy={r+sw} r={r} fill="none" stroke={seg.color} strokeWidth={sw}
                    strokeDasharray={`${segLen*drawP} ${circ-segLen*drawP}`} strokeDashoffset={thisOffset} strokeLinecap="round"/>;
                })}
              </svg>
              {/* Center text */}
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontSize:48,fontWeight:700,color:C.text}}>{Math.round(total*drawP)}</div>
                <div style={{fontSize:18,color:C.dim}}>{TOTAL_LABEL}</div>
              </div>
            </div>
          </E>
          {/* Legend */}
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {SEGMENTS.map((seg,i) => (
              <E key={i} d={30+i*8} from="up">
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:16,height:16,borderRadius:4,backgroundColor:seg.color,flexShrink:0}}/>
                  <div style={{fontSize:22,fontWeight:400,color:C.text,minWidth:160}}>{seg.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:seg.color}}>{seg.value}%</div>
                </div>
              </E>
            ))}
          </div>
        </div>
      </Safe>
    </Fd>
  );
};
export const TemplateTestDonut:React.FC = () => (<AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}><Sequence from={0} durationInFrames={240} premountFor={10}><Section1/></Sequence></AbsoluteFill>);
