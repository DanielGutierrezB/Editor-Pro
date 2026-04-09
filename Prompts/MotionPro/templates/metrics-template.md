# Template: Metrics

Use this for KPI/number dashboards. Numbers count up with interpolate.

```tsx
const Metric:React.FC<{value:number; label:string; suffix?:string; accent:string; d:number; dur:number}> = ({value,label,suffix='',accent,d,dur}) => {
  const frame = useCurrentFrame();
  const progress = spring({frame:frame-d, fps:30, config:{damping:14, mass:0.4}});
  const count = Math.round(interpolate(progress, [0,1], [0, value]));
  return (
    <E d={d} from="up" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
      <div style={{fontSize:72, fontWeight:700, color:accent, fontFamily:"'DM Sans',sans-serif"}}>{count}{suffix}</div>
      <div style={{fontSize:18, color:C.dim, textTransform:'uppercase', letterSpacing:2}}>{label}</div>
    </E>
  );
};

// Usage:
<Safe style={{flexDirection:'row', gap:80, justifyContent:'center'}}>
  <Metric value={73} suffix="%" label="Usuarios" accent={C.accent} d={0} dur={60} />
  <Metric value={2400} suffix="" label="Clientes" accent={C.orange} d={15} dur={60} />
  <Metric value={99} suffix="%" label="Uptime" accent={C.green} d={30} dur={60} />
</Safe>
```