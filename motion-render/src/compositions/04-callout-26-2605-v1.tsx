import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, Img, staticFile} useCurrentFrame} useVideoConfig} interpolate} Easing} from 'remotion';
import { Clock, GitBranch, RotateCcw } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#2d2d2d', card:'#3a3a3a', accent:'#5DADE2', green:'#52C41A',
  orange:'#FA8C16', purple:'#9254DE', red:'#F5222D', text:'#FFFFFF',
  dim:'rgba(255,255,255,0.7)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(93,173,226,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',...style}}>
    {children}
  </div>
);

// ─── Animation Engine (auto-injected, do not modify) ───────────────────────
const Anim:React.FC<{type?:string;delay?:number;children:React.ReactNode;style?:React.CSSProperties}> = ({type='fade-up',delay=0,children,style}) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);
  const p = interpolate(f, [0, 18], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  let transform = '';
  switch(type) {
    case 'fade-up':    transform = `translateY(${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-down':  transform = `translateY(${interpolate(p,[0,1],[-60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-left':  transform = `translateX(${interpolate(p,[0,1],[80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'fade-right': transform = `translateX(${interpolate(p,[0,1],[-80,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
    case 'pop':        transform = `scale(${interpolate(p,[0,1],[0.7,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`; break;
    case 'fade':       transform = ''; break;
    default:           transform = `translateY(${interpolate(p,[0,1],[60,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}px)`; break;
  }
  return <div style={{opacity:p, transform: transform || undefined, ...style}}>{children}</div>;
};


// ─── Section Engine (auto-injected, do not modify) ─────────────────────────
const Section:React.FC<{from:number;dur:number;children:React.ReactNode}> = ({from,dur,children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames: totalDur} = useVideoConfig();
  const localFrame = frame - from;
  // Visible when localFrame is within [0, dur)
  if (localFrame < -10 || localFrame >= dur) return null;
  // Fade in over 10 frames, fade out over 10 frames
  const fi = 10;
  const fo = 10;
  const fadeIn = interpolate(localFrame, [0, fi], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const endStart = Math.max(fi + 1, dur - fo);
  const fadeOut = interpolate(localFrame, [endStart, dur], [1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  const opacity = Math.min(fadeIn, fadeOut);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};



 delay?:number; children:React.ReactNode; style?:React.CSSProperties}>;
 dur:number; children:React.ReactNode}>;

export const M04Callout262605V1:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Safe style={{alignItems:'flex-start',justifyContent:'flex-start',padding:0}}>
      {/* Background gears - large decorative elements */}
      <Anim type="fade" delay={0}>
        <div style={{
          position:'absolute',
          top:-120,
          right:-80,
          width:400,
          height:400,
          borderRadius:'50%',
          border:`3px solid ${C.accent}08`,
          transform:'rotate(45deg)',
        }}/>
      </Anim>
      
      <Anim type="fade" delay={3}>
        <div style={{
          position:'absolute',
          bottom:-100,
          left:-60,
          width:300,
          height:300,
          borderRadius:'50%',
          border:`2px solid ${C.purple}10`,
          transform:'rotate(-30deg)',
        }}/>
      </Anim>

      {/* Git icon with glow effect */}
      <Anim type="pop" delay={0}>
        <div style={{
          position:'absolute',
          top:60,
          left:80,
          background:`radial-gradient(circle, ${C.accent}20, transparent)`,
          width:160,
          height:160,
          borderRadius:'50%',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
        }}>
          <GitBranch size={80} color={C.accent} strokeWidth={2.5}/>
        </div>
      </Anim>

      {/* Main text - dramatic scale */}
      <Anim type="fade-right" delay={8}>
        <div style={{
          fontSize:140,
          fontWeight:700,
          color:C.text,
          marginTop:280,
          marginLeft:80,
          letterSpacing:'-4px',
          lineHeight:0.9,
        }}>
          Git =
        </div>
      </Anim>

      {/* Time machine text */}
      <Anim type="fade-left" delay={15}>
        <div style={{
          fontSize:72,
          fontWeight:700,
          color:C.accent,
          marginTop:20,
          marginLeft:80,
          display:'flex',
          alignItems:'center',
          gap:20,
        }}>
          <Clock size={60} strokeWidth={2.5}/>
          Máquina del
        </div>
      </Anim>

      <Anim type="fade-up" delay={22}>
        <div style={{
          fontSize:96,
          fontWeight:700,
          color:C.text,
          marginLeft:80,
          marginTop:-10,
          background:`linear-gradient(135deg, ${C.text}, ${C.dim})`,
          WebkitBackgroundClip:'text',
          WebkitTextFillColor:'transparent',
        }}>
          TIEMPO
        </div>
      </Anim>

      {/* Project context */}
      <Anim type="fade" delay={30}>
        <div style={{
          fontSize:36,
          fontWeight:400,
          color:C.dim,
          marginLeft:80,
          marginTop:20,
          display:'flex',
          alignItems:'center',
          gap:12,
        }}>
          para tu proyecto
          <RotateCcw size={32} strokeWidth={2}/>
        </div>
      </Anim>

      {/* Particle effects - floating elements */}
      <Anim type="pop" delay={35}>
        <div style={{
          position:'absolute',
          top:180,
          right:200,
          width:12,
          height:12,
          borderRadius:'50%',
          backgroundColor:C.accent,
          opacity:0.6,
        }}/>
      </Anim>

      <Anim type="pop" delay={38}>
        <div style={{
          position:'absolute',
          top:320,
          right:120,
          width:8,
          height:8,
          borderRadius:'50%',
          backgroundColor:C.purple,
          opacity:0.5,
        }}/>
      </Anim>

      <Anim type="pop" delay={41}>
        <div style={{
          position:'absolute',
          bottom:100,
          right:280,
          width:16,
          height:16,
          borderRadius:'50%',
          backgroundColor:C.orange,
          opacity:0.4,
        }}/>
      </Anim>

      {/* Decorative gear element */}
      <Anim type="fade" delay={25}>
        <div style={{
          position:'absolute',
          bottom:40,
          right:60,
          width:120,
          height:120,
          border:`2px solid ${C.accent}15`,
          borderRadius:'50%',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
        }}>
          <div style={{
            width:80,
            height:80,
            border:`2px solid ${C.accent}25`,
            borderRadius:'50%',
          }}/>
        </div>
      </Anim>
    </Safe>
  </AbsoluteFill>
);