import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
import { M1Title072604V1 } from './compositions/1-title-07-2604-v1';
import { M2Cards072604V1 } from './compositions/2-cards-07-2604-v1';
import { M2Steps072604V1 } from './compositions/2-steps-07-2604-v1';
import { M3Diagram072604V1 } from './compositions/3-diagram-07-2604-v1';
import { M4Cards072604V1 } from './compositions/4-cards-07-2604-v1';
import { M4Steps072604V1 } from './compositions/4-steps-07-2604-v1';
import { M5Cards072604V1 } from './compositions/5-cards-07-2604-v1';
import { M6Diagram072604V1 } from './compositions/6-diagram-07-2604-v1';
import { M7Reveal072604V1 } from './compositions/7-reveal-07-2604-v1';
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
            <Composition id="1-title-07-2604-v1" component={M1Title072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="2-cards-07-2604-v1" component={M2Cards072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="2-steps-07-2604-v1" component={M2Steps072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="3-diagram-07-2604-v1" component={M3Diagram072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="4-cards-07-2604-v1" component={M4Cards072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="4-steps-07-2604-v1" component={M4Steps072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="5-cards-07-2604-v1" component={M5Cards072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="6-diagram-07-2604-v1" component={M6Diagram072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="7-reveal-07-2604-v1" component={M7Reveal072604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};