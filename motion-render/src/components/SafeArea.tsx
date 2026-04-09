import React from 'react';
import { SAFE_AREA } from './theme';

export const Safe: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      position: 'absolute',
      left: SAFE_AREA.left,
      top: SAFE_AREA.top,
      right: SAFE_AREA.right,
      bottom: SAFE_AREA.bottom,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      ...style,
    }}
  >
    {children}
  </div>
);
