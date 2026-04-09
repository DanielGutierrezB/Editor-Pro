# Audio Cues for Motion Graphics

> Place .mp3 sound effect files in motion-render/public/sfx/ to enable audio cues.
> When SFX files are present, the LLM will include them in the compositions.

## Available Sound Effects
Place these files in `motion-render/public/sfx/`:
- `whoosh.mp3` — Fast entrance (for E from="left"/"right")
- `pop.mp3` — Element appears (for E from="pop")
- `click.mp3` — Button/card interaction
- `reveal.mp3` — Progressive reveal/draw-on
- `success.mp3` — Checkmark/completion
- `transition.mp3` — Section transition

## Usage in TSX (when files exist)
```tsx
import { Audio, staticFile } from 'remotion';

// Play sound when element enters
<Sequence from={30} durationInFrames={15}>
  <Audio src={staticFile('sfx/whoosh.mp3')} volume={0.3} />
</Sequence>
```

## Rules
- Volume: 0.2-0.4 (subtle, never distracting)
- Only on KEY moments (first element of a section, important reveals)
- Maximum 2-3 sounds per motion (less is more)
- NOT on every stagger element — only the first of a group
- If sfx files don't exist, DO NOT include Audio elements
