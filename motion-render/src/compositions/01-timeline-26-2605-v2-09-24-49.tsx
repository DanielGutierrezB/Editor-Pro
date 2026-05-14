import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Camera, Clock, ArrowLeft, Folder, GitBranch, History, Save, Image } from 'lucide-react';

const _static = (getInputProps() as any).staticPreview === true;
const useCurrentFrame = () => _static ? 9999 : _useRawFrame();

const C = {
  bg:'#1a1d23', card:'#2d323a', accent:'#0ae98d', green:'#0ae98d',
  orange:'#fb923c', purple:'#a78bfa', red:'#f87171', text:'#ffffff',
  dim:'rgba(255,255,255,0.55)', border:'rgba(255,255,255,0.08)',
  glow:'rgba(10,233,141,0.08)',
};

const Safe:React.FC<{children:React.ReactNode;style?:React.CSSProperties}> = ({children,style}) => (
  <div style={{position:'absolute',left:160,top:180,right:160,bottom:160,
    display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
    ...style}}>
    {children}
  </div>
);

const E:React.FC<{d:number;children:React.ReactNode;from?:string;style?:React.CSSProperties}> = ({d,children,from='up',style}) => {
  if (_static) return <div style={{opacity:1,...style}}>{children}</div>;
  const frame = useCurrentFrame();
  const progress = interpolate(frame-d, [0, 20], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = from==='up'?interpolate(progress,[0,1],[80,0]):from==='down'?interpolate(progress,[0,1],[-80,0]):0;
  const x = from==='left'?interpolate(progress,[0,1],[80,0]):from==='right'?interpolate(progress,[0,1],[-80,0]):0;
  const sc = from==='pop'?interpolate(progress,[0,1],[0.85,1]):1;
  return <div style={{transform:`translate(${x}px,${y}px) scale(${sc})`,opacity:progress,...style}}>{children}</div>;
};

const Fd:React.FC<{children:React.ReactNode;fi?:number;fo?:number;dur:number}> = ({children,fi=10,fo=10,dur}) => {
  if (_static) return <div style={{opacity:1,position:'absolute',inset:0}}>{children}</div>;
  const frame = useCurrentFrame();
  const _fi = Math.max(1, fi);
  const _fo = Math.max(1, fo);
  const _end = Math.max(_fi + 1, dur - _fo);
  return <div style={{opacity:interpolate(frame,[0,_fi,_end,dur],[0,1,1,0],{extrapolateRight:'clamp'}),position:'absolute',inset:0}}>{children}</div>;
};

const TimelineSection:React.FC = () => {
  const frame = useCurrentFrame();
  
  // Timeline progress
  const lineProgress = interpolate(frame, [0, 852], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // Node appearances
  const node1 = interpolate(frame, [100, 120], [0, 1], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const node2 = interpolate(frame, [250, 270], [0, 1], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const node3 = interpolate(frame, [400, 420], [0, 1], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const node4 = interpolate(frame, [550, 570], [0, 1], {
    easing: Easing.bezier(0.34, 1.56, 0.64, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // Folder transformation
  const folderScale = interpolate(frame, [0, 852], [0.8, 1.2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const folderRotation = interpolate(frame, [0, 852], [0, 360], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // Color evolution
  const colorIntensity = interpolate(frame, [0, 852], [0.3, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // Time arrow curve
  const arrowProgress = interpolate(frame, [700, 852], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  return (
    <Safe>
      {/* Central evolving folder */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${folderScale}) rotate(${folderRotation}deg)`,
      }}>
        <Folder size={120} color={interpolate(colorIntensity, [0, 1], ['#666666', C.accent])} strokeWidth={2} />
      </div>
      
      {/* Timeline line */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 100,
        width: 1400,
        height: 4,
        backgroundColor: C.dim,
        opacity: 0.3,
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${lineProgress * 100}%`,
          height: '100%',
          backgroundColor: C.accent,
          borderRadius: 2,
        }} />
      </div>
      
      {/* Node 1: Initial state */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 250,
        transform: `translate(-50%, -50%) scale(${node1})`,
      }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: interpolate(node1, [0, 1], ['#333333', C.card]),
          border: `2px solid ${C.accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 30px ${C.accent}20`,
        }}>
          <GitBranch size={48} color={C.accent} />
        </div>
        
        {/* Photo snapshot above */}
        <div style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: node1,
        }}>
          <div style={{
            backgroundColor: interpolate(node1, [0, 1], ['#2d2d2d', C.card]),
            borderRadius: 12,
            padding: 16,
            width: 180,
            height: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${C.border}`,
          }}>
            <Image size={32} color={C.dim} />
            <div style={{fontSize: 18, color: C.text, marginTop: 8, textAlign: 'center'}}>Proyecto inicial</div>
          </div>
          
          {/* Dotted line connection */}
          <svg style={{position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', width: 2, height: 60}}>
            <line x1="1" y1="0" x2="1" y2="60" stroke={C.dim} strokeWidth="2" strokeDasharray="4 4" opacity={0.5} />
          </svg>
        </div>
      </div>
      
      {/* Node 2: Menu added */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 550,
        transform: `translate(-50%, -50%) scale(${node2})`,
      }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: interpolate(node2, [0, 1], ['#404040', C.card]),
          border: `2px solid ${C.accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 30px ${C.accent}20`,
        }}>
          <Save size={48} color={C.accent} />
        </div>
        
        {/* Photo snapshot above */}
        <div style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: node2,
        }}>
          <div style={{
            backgroundColor: interpolate(node2, [0, 1], ['#3a3a3a', C.card]),
            borderRadius: 12,
            padding: 16,
            width: 180,
            height: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${C.border}`,
          }}>
            <Image size={32} color={C.orange} />
            <div style={{fontSize: 18, color: C.text, marginTop: 8, textAlign: 'center'}}>Agregué el menú</div>
          </div>
          
          {/* Dotted line connection */}
          <svg style={{position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', width: 2, height: 60}}>
            <line x1="1" y1="0" x2="1" y2="60" stroke={C.dim} strokeWidth="2" strokeDasharray="4 4" opacity={0.5} />
          </svg>
        </div>
      </div>
      
      {/* Node 3: Header colors */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 850,
        transform: `translate(-50%, -50%) scale(${node3})`,
      }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: interpolate(node3, [0, 1], ['#4d4d4d', C.card]),
          border: `2px solid ${C.accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 30px ${C.accent}20`,
        }}>
          <Camera size={48} color={C.accent} />
        </div>
        
        {/* Photo snapshot above */}
        <div style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: node3,
        }}>
          <div style={{
            backgroundColor: interpolate(node3, [0, 1], ['#474747', C.card]),
            borderRadius: 12,
            padding: 16,
            width: 200,
            height: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${C.border}`,
          }}>
            <Image size={32} color={C.purple} />
            <div style={{fontSize: 18, color: C.text, marginTop: 8, textAlign: 'center'}}>Cambié colores del header</div>
          </div>
          
          {/* Dotted line connection */}
          <svg style={{position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', width: 2, height: 60}}>
            <line x1="1" y1="0" x2="1" y2="60" stroke={C.dim} strokeWidth="2" strokeDasharray="4 4" opacity={0.5} />
          </svg>
        </div>
      </div>
      
      {/* Node 4: Current state */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: 1150,
        transform: `translate(-50%, -50%) scale(${node4})`,
      }}>
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          backgroundColor: C.card,
          border: `2px solid ${C.accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 40px ${C.accent}30`,
        }}>
          <History size={48} color={C.accent} />
        </div>
        
        {/* Photo snapshot above */}
        <div style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: node4,
        }}>
          <div style={{
            backgroundColor: C.card,
            borderRadius: 12,
            padding: 16,
            width: 180,
            height: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${C.accent}`,
            boxShadow: `0 0 20px ${C.accent}20`,
          }}>
            <Image size={32} color={C.accent} />
            <div style={{fontSize: 18, color: C.accent, marginTop: 8, fontWeight: 700, textAlign: 'center'}}>Presente</div>
          </div>
          
          {/* Dotted line connection */}
          <svg style={{position: 'absolute', top: 120, left: '50%', transform: 'translateX(-50%)', width: 2, height: 60}}>
            <line x1="1" y1="0" x2="1" y2="60" stroke={C.accent} strokeWidth="2" strokeDasharray="4 4" opacity={0.8} />
          </svg>
        </div>
      </div>
      
      {/* Curved arrow indicating time travel */}
      <svg style={{
        position: 'absolute',
        top: '65%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 400,
        height: 120,
        opacity: arrowProgress,
      }}>
        <path
          d="M 350 20 Q 200 80 50 20"
          fill="none"
          stroke={C.accent}
          strokeWidth="3"
          strokeDasharray="8 6"
          opacity={0.6}
        />
        <polygon
          points="45,25 50,20 55,30"
          fill={C.accent}
          opacity={0.8}
        />
      </svg>
      
      {/* Git logo with clock */}
      <E d={750} from="pop" style={{
        position: 'absolute',
        bottom: 40,
        right: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <GitBranch size={64} color={C.accent} />
        <Clock size={48} color={C.orange} />
      </E>
    </Safe>
  );
};

export const M01Timeline262605V2092449:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg,fontFamily:"'DM Sans',sans-serif"}}>
    <Sequence from={0} durationInFrames={852} premountFor={10}>
      <Fd dur={852} fo={1}>
        <TimelineSection />
      </Fd>
    </Sequence>
  </AbsoluteFill>
);