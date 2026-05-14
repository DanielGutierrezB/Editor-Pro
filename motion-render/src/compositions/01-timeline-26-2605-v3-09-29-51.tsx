import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/700.css";
import React from 'react';
import {AbsoluteFill, useCurrentFrame as _useRawFrame, useVideoConfig, interpolate, Easing, Sequence, getInputProps} from 'remotion';
import { Camera, Clock, ArrowLeft, Folder, Save, Tag, GitBranch } from 'lucide-react';

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
  
  // Timeline progress animation
  const timelineProgress = interpolate(frame, [0, 600], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  // Color evolution from gray to vibrant
  const colorEvolution = interpolate(frame, [0, 600], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const grayColor = 'rgba(255,255,255,0.3)';
  const vibrantColor = C.accent;
  
  // Snapshot positions - adjusted to not overlap
  const snapshots = [
    { frame: 150, label: 'Inicio del proyecto', icon: Folder, color: grayColor, yOffset: -200 },
    { frame: 300, label: 'Agregué el menú', icon: Save, color: interpolate(colorEvolution, [0, 0.5, 1], [0, 0.5, 1]) > 0.3 ? C.orange : grayColor, yOffset: -280 },
    { frame: 450, label: 'Cambié los colores', icon: Tag, color: interpolate(colorEvolution, [0, 0.7, 1], [0, 0.7, 1]) > 0.5 ? C.purple : grayColor, yOffset: -200 },
    { frame: 600, label: 'Estado actual', icon: GitBranch, color: vibrantColor, yOffset: -280 },
  ];
  
  return (
    <Safe>
      {/* Title appearing at start - moved higher */}
      {frame < 120 && (
        <E d={0} from="up">
          <div style={{
            fontSize: 56,
            fontWeight: 700,
            color: C.accent,
            textAlign: 'center',
            marginBottom: 400,
          }}>
            Git: Tu máquina del tiempo
          </div>
        </E>
      )}
      
      {/* Central timeline container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      }}>
        
        {/* Timeline and snapshots */}
        <div style={{
          position: 'relative',
          width: 1200,
          height: 400,
        }}>
          
          {/* Timeline line */}
          <div style={{
            position: 'absolute',
            width: 1200,
            height: 2,
            background: C.border,
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
          }}>
            {/* Animated progress line */}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${timelineProgress * 100}%`,
              background: `linear-gradient(90deg, ${grayColor}, ${vibrantColor})`,
            }} />
          </div>
          
          {/* Central project folder */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%)`,
          }}>
            <E d={30} from="pop">
              <Folder 
                size={100} 
                color={interpolate(colorEvolution, [0, 1], [0, 1]) > 0.5 ? vibrantColor : grayColor}
                strokeWidth={2}
              />
            </E>
          </div>
          
          {/* Snapshots with proper spacing */}
          {snapshots.map((snapshot, i) => {
            const isVisible = frame >= snapshot.frame;
            const snapProgress = interpolate(
              frame - snapshot.frame,
              [0, 30],
              [0, 1],
              {
                easing: Easing.bezier(0.34, 1.56, 0.64, 1),
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }
            );
            
            const xPos = (i / (snapshots.length - 1)) * 1000 + 100;
            const Icon = snapshot.icon;
            
            return isVisible ? (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: xPos,
                  transform: `translate(-50%, ${snapshot.yOffset}px) scale(${snapProgress})`,
                  opacity: snapProgress,
                }}
              >
                {/* Snapshot card */}
                <div style={{
                  background: C.card,
                  borderRadius: 16,
                  padding: 20,
                  border: `2px solid ${snapshot.color}`,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.3)`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  width: 200,
                }}>
                  <Icon size={40} color={snapshot.color} strokeWidth={2} />
                  <div style={{
                    fontSize: 18,
                    color: C.text,
                    textAlign: 'center',
                    fontWeight: 600,
                  }}>
                    {snapshot.label}
                  </div>
                </div>
                
                {/* Dotted line to timeline */}
                <svg
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 2,
                    height: Math.abs(snapshot.yOffset) - 100,
                  }}
                >
                  <line
                    x1="1"
                    y1="0"
                    x2="1"
                    y2={Math.abs(snapshot.yOffset) - 100}
                    stroke={snapshot.color}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    opacity={0.6}
                  />
                </svg>
              </div>
            ) : null;
          })}
        </div>
        
        {/* Time travel arrow - moved to not overlap */}
        {frame > 650 && (
          <E d={650} from="right">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginTop: 100,
            }}>
              <ArrowLeft size={40} color={vibrantColor} strokeWidth={2} />
              <div style={{
                fontSize: 24,
                color: C.text,
                fontWeight: 600,
              }}>
                Viaja en el tiempo
              </div>
            </div>
          </E>
        )}
      </div>
      
      {/* Git + Clock logo - in corner */}
      <E d={30} from="pop">
        <div style={{
          position: 'absolute',
          bottom: 60,
          right: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: 0.8,
        }}>
          <GitBranch size={40} color={vibrantColor} strokeWidth={2} />
          <Clock size={32} color={vibrantColor} strokeWidth={2} />
        </div>
      </E>
    </Safe>
  );
};

export const M01Timeline262605V3092951:React.FC = () => (
  <AbsoluteFill style={{backgroundColor:C.bg, fontFamily:"'DM Sans',sans-serif"}}>
    <Sequence from={0} durationInFrames={852} premountFor={10}>
      <Fd dur={852} fo={1}>
        <TimelineSection />
      </Fd>
    </Sequence>
  </AbsoluteFill>
);