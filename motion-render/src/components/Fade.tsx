import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';

export const Fd: React.FC<{
  children: React.ReactNode;
  fi?: number;
  fo?: number;
  dur: number;
}> = ({ children, fi = 10, fo = 10, dur }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(
          frame,
          [0, fi, dur - fo, dur],
          [0, 1, 1, 0],
          { extrapolateRight: 'clamp' }
        ),
        position: 'absolute',
        inset: 0,
      }}
    >
      {children}
    </div>
  );
};
