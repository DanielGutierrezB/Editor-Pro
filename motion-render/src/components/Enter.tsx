import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

type Direction = 'up' | 'down' | 'left' | 'right' | 'pop';

export const E: React.FC<{
  d: number;
  children: React.ReactNode;
  from?: Direction;
  style?: React.CSSProperties;
}> = ({ d, children, from = 'up', style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - d, fps, config: { damping: 14, mass: 0.4 } });

  const y =
    from === 'up' ? interpolate(s, [0, 1], [25, 0]) :
    from === 'down' ? interpolate(s, [0, 1], [-25, 0]) : 0;
  const x =
    from === 'left' ? interpolate(s, [0, 1], [25, 0]) :
    from === 'right' ? interpolate(s, [0, 1], [-25, 0]) : 0;
  const sc = from === 'pop' ? interpolate(s, [0, 1], [0.85, 1]) : 1;

  return (
    <div
      style={{
        transform: `translate(${x}px, ${y}px) scale(${sc})`,
        opacity: interpolate(s, [0, 0.15], [0, 1], { extrapolateRight: 'clamp' }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};
