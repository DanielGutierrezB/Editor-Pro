import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
import { M01Reveal222605V1172133617 } from './compositions/01-reveal-22-2605-v1-17-21-33-617';
import { M01Reveal222605V1174428541 } from './compositions/01-reveal-22-2605-v1-17-44-28-541';
import { M02Reveal222605V1172250200 } from './compositions/02-reveal-22-2605-v1-17-22-50-200';
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
            <Composition id="01-reveal-22-2605-v1-17-21-33-617" component={M01Reveal222605V1172133617} durationInFrames={786} fps={30} width={1920} height={1080} />
            <Composition id="01-reveal-22-2605-v1-17-44-28-541" component={M01Reveal222605V1174428541} durationInFrames={786} fps={30} width={1920} height={1080} />
            <Composition id="02-reveal-22-2605-v1-17-22-50-200" component={M02Reveal222605V1172250200} durationInFrames={3879} fps={30} width={1920} height={1080} />
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};