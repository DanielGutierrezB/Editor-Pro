import React from 'react';
import { Composition } from 'remotion';
import { TplBeforeafter } from './compositions/tpl-beforeafter';
import { Tplcallout } from './compositions/tpl-callout';
import { Tplcards } from './compositions/tpl-cards';
import { Tplchart } from './compositions/tpl-chart';
import { Tplcomparison } from './compositions/tpl-comparison';
import { Tpldiagram } from './compositions/tpl-diagram';
import { Tplfunnel } from './compositions/tpl-funnel';
import { Tplgauge } from './compositions/tpl-gauge';
import { Tplicons } from './compositions/tpl-icons';
import { Tpllist } from './compositions/tpl-list';
import { Tplmetrics } from './compositions/tpl-metrics';
import { Tplreveal } from './compositions/tpl-reveal';
import { Tplsteps } from './compositions/tpl-steps';
import { Tpltimeline } from './compositions/tpl-timeline';
import { Tpltitle } from './compositions/tpl-title';
import { Tplui } from './compositions/tpl-ui';

export const RemotionRoot: React.FC = () => (<>
  <Composition id="tpl-beforeafter" component={TplBeforeafter} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-callout" component={Tplcallout} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-cards" component={Tplcards} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-chart" component={Tplchart} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-comparison" component={Tplcomparison} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-diagram" component={Tpldiagram} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-funnel" component={Tplfunnel} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-gauge" component={Tplgauge} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-icons" component={Tplicons} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-list" component={Tpllist} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-metrics" component={Tplmetrics} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-reveal" component={Tplreveal} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-steps" component={Tplsteps} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-timeline" component={Tpltimeline} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-title" component={Tpltitle} durationInFrames={300} fps={30} width={1920} height={1080} />
  <Composition id="tpl-ui" component={Tplui} durationInFrames={300} fps={30} width={1920} height={1080} />
</>);
