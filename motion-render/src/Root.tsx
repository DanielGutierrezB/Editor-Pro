import React from 'react';
import { Composition } from 'remotion';
import { TemplateTestLinechart } from './compositions/template-test-linechart';
import { TemplateTestDonut } from './compositions/template-test-donut';
import { TemplateTestProgressbars } from './compositions/template-test-progressbars';
export const RemotionRoot: React.FC = () => (<>
  <Composition id="t-linechart" component={TemplateTestLinechart} durationInFrames={240} fps={30} width={1920} height={1080} />
  <Composition id="t-donut" component={TemplateTestDonut} durationInFrames={240} fps={30} width={1920} height={1080} />
  <Composition id="t-progressbars" component={TemplateTestProgressbars} durationInFrames={240} fps={30} width={1920} height={1080} />
</>);
