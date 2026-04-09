import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
import { M1Icons062604V1 } from './compositions/1-icons-06-2604-v1';
import { M1Icons062604V2 } from './compositions/1-icons-06-2604-v2';
import { M1Title062604V1 } from './compositions/1-title-06-2604-v1';
import { M10List062604V1 } from './compositions/10-list-06-2604-v1';
import { M10List062604V2 } from './compositions/10-list-06-2604-v2';
import { M11Reveal062604V1 } from './compositions/11-reveal-06-2604-v1';
import { M11Reveal062604V2 } from './compositions/11-reveal-06-2604-v2';
import { M2Steps062604V1 } from './compositions/2-steps-06-2604-v1';
import { M2Steps062604V2 } from './compositions/2-steps-06-2604-v2';
import { M3Comparison062604V1 } from './compositions/3-comparison-06-2604-v1';
import { M3Comparison062604V2 } from './compositions/3-comparison-06-2604-v2';
import { M4Steps062604V1 } from './compositions/4-steps-06-2604-v1';
import { M4Steps062604V2 } from './compositions/4-steps-06-2604-v2';
import { M5Comparison062604V1 } from './compositions/5-comparison-06-2604-v1';
import { M5Comparison062604V2 } from './compositions/5-comparison-06-2604-v2';
import { M6Comparison062604V1 } from './compositions/6-comparison-06-2604-v1';
import { M6Diagram062604V1 } from './compositions/6-diagram-06-2604-v1';
import { M6Diagram062604V2 } from './compositions/6-diagram-06-2604-v2';
import { M7Cards062604V1 } from './compositions/7-cards-06-2604-v1';
import { M7Cards062604V2 } from './compositions/7-cards-06-2604-v2';
import { M8Comparison062604V1 } from './compositions/8-comparison-06-2604-v1';
import { M8Comparison062604V2 } from './compositions/8-comparison-06-2604-v2';
import { M9Comparison062604V1 } from './compositions/9-comparison-06-2604-v1';
import { M9Comparison062604V2 } from './compositions/9-comparison-06-2604-v2';
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
            <Composition id="1-icons-06-2604-v1" component={M1Icons062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="1-icons-06-2604-v2" component={M1Icons062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="1-title-06-2604-v1" component={M1Title062604V1} durationInFrames={219} fps={30} width={1920} height={1080} />
            <Composition id="10-list-06-2604-v1" component={M10List062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="10-list-06-2604-v2" component={M10List062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="11-reveal-06-2604-v1" component={M11Reveal062604V1} durationInFrames={471} fps={30} width={1920} height={1080} />
            <Composition id="11-reveal-06-2604-v2" component={M11Reveal062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="2-steps-06-2604-v1" component={M2Steps062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="2-steps-06-2604-v2" component={M2Steps062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="3-comparison-06-2604-v1" component={M3Comparison062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="3-comparison-06-2604-v2" component={M3Comparison062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="4-steps-06-2604-v1" component={M4Steps062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="4-steps-06-2604-v2" component={M4Steps062604V2} durationInFrames={1131} fps={30} width={1920} height={1080} />
            <Composition id="5-comparison-06-2604-v1" component={M5Comparison062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="5-comparison-06-2604-v2" component={M5Comparison062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="6-comparison-06-2604-v1" component={M6Comparison062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="6-diagram-06-2604-v1" component={M6Diagram062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="6-diagram-06-2604-v2" component={M6Diagram062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="7-cards-06-2604-v1" component={M7Cards062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="7-cards-06-2604-v2" component={M7Cards062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="8-comparison-06-2604-v1" component={M8Comparison062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="8-comparison-06-2604-v2" component={M8Comparison062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="9-comparison-06-2604-v1" component={M9Comparison062604V1} durationInFrames={300} fps={30} width={1920} height={1080} />
            <Composition id="9-comparison-06-2604-v2" component={M9Comparison062604V2} durationInFrames={300} fps={30} width={1920} height={1080} />
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};