import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
import { M01Reveal262605V1 } from './compositions/01-reveal-26-2605-v1';
import { M02Timeline262605V1 } from './compositions/02-timeline-26-2605-v1';
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
            <Composition id="01-reveal-26-2605-v1" component={M01Reveal262605V1} durationInFrames={297} fps={30} width={1920} height={1080} />
            <Composition id="02-timeline-26-2605-v1" component={M02Timeline262605V1} durationInFrames={447} fps={30} width={1920} height={1080} />
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};