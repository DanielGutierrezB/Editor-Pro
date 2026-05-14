import React from 'react';
import { Composition } from 'remotion';
// === DYNAMIC IMPORTS START ===
import { M01Reveal262605V1090926 } from './compositions/01-reveal-26-2605-v1-09-09-26';
import { M01Reveal262605V1 } from './compositions/01-reveal-26-2605-v1';
import { M01Timeline262605V1092050 } from './compositions/01-timeline-26-2605-v1-09-20-50';
import { M01Timeline262605V2092449 } from './compositions/01-timeline-26-2605-v2-09-24-49';
import { M01Timeline262605V2092623 } from './compositions/01-timeline-26-2605-v2-09-26-23';
import { M01Timeline262605V3092951 } from './compositions/01-timeline-26-2605-v3-09-29-51';
import { M02Cards262605V1091008 } from './compositions/02-cards-26-2605-v1-09-10-08';
import { M02Timeline262605V1 } from './compositions/02-timeline-26-2605-v1';
import { M03Callout262605V1 } from './compositions/03-callout-26-2605-v1';
import { M03Timeline262605V1091051 } from './compositions/03-timeline-26-2605-v1-09-10-51';
import { M04Callout262605V1091127 } from './compositions/04-callout-26-2605-v1-09-11-27';
// === DYNAMIC IMPORTS END ===

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* === DYNAMIC COMPOSITIONS START === */}
            <Composition id="01-reveal-26-2605-v1-09-09-26" component={M01Reveal262605V1090926} durationInFrames={297} fps={30} width={1920} height={1080} />
            <Composition id="01-reveal-26-2605-v1" component={M01Reveal262605V1} durationInFrames={297} fps={30} width={1920} height={1080} />
            <Composition id="01-timeline-26-2605-v1-09-20-50" component={M01Timeline262605V1092050} durationInFrames={852} fps={30} width={1920} height={1080} />
            <Composition id="01-timeline-26-2605-v2-09-24-49" component={M01Timeline262605V2092449} durationInFrames={858} fps={30} width={1920} height={1080} />
            <Composition id="01-timeline-26-2605-v2-09-26-23" component={M01Timeline262605V2092623} durationInFrames={858} fps={30} width={1920} height={1080} />
            <Composition id="01-timeline-26-2605-v3-09-29-51" component={M01Timeline262605V3092951} durationInFrames={858} fps={30} width={1920} height={1080} />
            <Composition id="02-cards-26-2605-v1-09-10-08" component={M02Cards262605V1091008} durationInFrames={273} fps={30} width={1920} height={1080} />
            <Composition id="02-timeline-26-2605-v1" component={M02Timeline262605V1} durationInFrames={447} fps={30} width={1920} height={1080} />
            <Composition id="03-callout-26-2605-v1" component={M03Callout262605V1} durationInFrames={99} fps={30} width={1920} height={1080} />
            <Composition id="03-timeline-26-2605-v1-09-10-51" component={M03Timeline262605V1091051} durationInFrames={180} fps={30} width={1920} height={1080} />
            <Composition id="04-callout-26-2605-v1-09-11-27" component={M04Callout262605V1091127} durationInFrames={90} fps={30} width={1920} height={1080} />
      {/* === DYNAMIC COMPOSITIONS END === */}
    </>
  );
};