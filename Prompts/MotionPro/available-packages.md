# Available Packages for Motion Graphics

These packages are installed and available for use in compositions. USE THEM instead of building everything from scratch.

## Icons: lucide-react
Over 1400 professional SVG icons. ALWAYS prefer these over drawing SVG manually.

```tsx
import { Shield, Lock, Key, Globe, Server, Database, Mail, AlertTriangle, CheckCircle, XCircle, ArrowRight, Users, Settings, Code, Terminal, FileText, Folder, Cloud, Wifi, Zap } from 'lucide-react';

// Usage — renders as SVG with customizable size, color, strokeWidth
<Shield size={80} color={C.accent} strokeWidth={1.5} />
<Lock size={60} color={C.red} />
<ArrowRight size={24} color={C.dim} />
```

Common icons by category:
- Security: Shield, Lock, Key, ShieldAlert, Fingerprint, Eye, EyeOff
- Data: Database, Server, Cloud, HardDrive, Cpu
- Communication: Mail, MessageSquare, Send, Phone
- Status: CheckCircle, XCircle, AlertTriangle, AlertCircle, Info
- Navigation: ArrowRight, ArrowLeft, ChevronDown, ExternalLink
- Files: FileText, Folder, FolderOpen, Download, Upload
- UI: Settings, Search, Menu, X, Plus, Minus, Edit, Trash
- People: Users, User, UserPlus, UserCheck
- Tech: Code, Terminal, Wifi, Zap, Globe, Monitor, Smartphone

## Transitions: @remotion/transitions
Smooth transitions between sections instead of hard cuts.

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';

// In the component:
<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={150}>
    <Section1 />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: 15 })}
  />
  <TransitionSeries.Sequence durationInFrames={200}>
    <Section2 />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

Available transitions: fade(), slide(), wipe(), flip(), clockWipe()

## Shapes: @remotion/shapes
Perfect geometric shapes without manual SVG.

```tsx
import { Circle, Rect, Triangle, Star, Pie } from '@remotion/shapes';

<Circle radius={60} fill={C.accent} />
<Rect width={200} height={100} cornerRadius={12} fill={C.card} stroke={C.border} strokeWidth={1} />
<Triangle length={80} direction="up" fill={C.accent} />
<Star points={5} innerRadius={30} outerRadius={60} fill={C.accent} />
<Pie radius={80} progress={0.75} fill={C.accent} />  // For donut/pie charts
```

## Paths: @remotion/paths
Animate SVG paths — draw-on effects, morphing.

```tsx
import { evolvePath, getLength } from '@remotion/paths';

// Draw-on animation
const path = "M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80";
const evolution = evolvePath(frame / 60, path); // 0 to 1 progress
<svg><path d={path} strokeDasharray={evolution.strokeDasharray} strokeDashoffset={evolution.strokeDashoffset} stroke={C.accent} strokeWidth={3} fill="none" /></svg>
```

## Motion Blur: @remotion/motion-blur
Cinematic motion blur on fast-moving elements.

```tsx
import { Trail } from '@remotion/motion-blur';

<Trail layers={8} lagInFrames={0.02}>
  <E d={0} from="left"><MyContent /></E>
</Trail>
```

## Noise: @remotion/noise
Organic backgrounds and subtle movement.

```tsx
import { noise2D, noise3D } from '@remotion/noise';

// Subtle organic offset
const offsetX = noise2D('x', frame * 0.01, 0) * 5;
const offsetY = noise2D('y', 0, frame * 0.01) * 5;
```

## Lottie: @remotion/lottie
Play Lottie animations (After Effects exports).

```tsx
import { Lottie, LottieAnimationData } from '@remotion/lottie';
import { useEffect, useState } from 'react';

// Load from URL
const [animData, setAnimData] = useState<LottieAnimationData | null>(null);
useEffect(() => {
  fetch('https://assets2.lottiefiles.com/packages/lf20_example.json')
    .then(r => r.json())
    .then(setAnimData);
}, []);

{animData && <Lottie animationData={animData} />}
```

## RULES FOR USING PACKAGES
1. ALWAYS use lucide-react icons instead of drawing SVG manually
2. Prefer TransitionSeries over hard <Sequence> cuts when transitions make sense
3. Use @remotion/shapes for geometric elements instead of manual SVG
4. Use @remotion/paths evolvePath for timeline and reveal type animations
5. Motion blur is optional — use only when it enhances the visual
6. All packages are already installed — just import and use

## Animation Types that leverage these packages
- **timeline**: Uses @remotion/paths (draw-on line) + @remotion/shapes (Circle nodes) + lucide-react icons
- **reveal**: Uses @remotion/paths (evolvePath) + @remotion/motion-blur (Trail) + @remotion/noise
- **list**: Uses TransitionSeries + lucide-react icons + @remotion/shapes (Rect highlights)
- **metrics**: Uses @remotion/shapes (Circle/Pie progress) + lucide-react (TrendingUp) + interpolate for counting
