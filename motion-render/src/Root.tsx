import React from 'react';
import { Composition } from 'remotion';
import { Testtitle } from './compositions/test-title';
import { Testicons } from './compositions/test-icons';
import { Teststeps } from './compositions/test-steps';
import { Testcards } from './compositions/test-cards';
export const RemotionRoot: React.FC = () => (<>
  <Composition id="test-title" component={Testtitle} durationInFrames={180} fps={30} width={1920} height={1080} />
  <Composition id="test-icons" component={Testicons} durationInFrames={210} fps={30} width={1920} height={1080} />
  <Composition id="test-steps" component={Teststeps} durationInFrames={360} fps={30} width={1920} height={1080} />
  <Composition id="test-cards" component={Testcards} durationInFrames={300} fps={30} width={1920} height={1080} />
</>);
