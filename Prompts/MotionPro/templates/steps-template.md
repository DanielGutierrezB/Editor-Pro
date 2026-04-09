# Template: Steps

Use this structure for step-by-step animations. One step per Sequence, with progress dots.

```tsx
const StepView:React.FC<{step:number; total:number; icon:React.ReactNode; title:string; desc:string; accent:string; d:number}> = ({step,total,icon,title,desc,accent,d}) => (
  <Safe style={{flexDirection:'row', gap:60}}>
    <E d={d} from="left" style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:20}}>
      <div style={{width:140, height:140, borderRadius:70, background:C.card, border:`2px solid ${accent}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 30px ${accent}22`}}>
        {icon}
      </div>
      <div style={{fontSize:36, fontWeight:700, color:'#fff', textAlign:'center'}}>{title}</div>
      <div style={{fontSize:18, color:C.dim, textAlign:'center', maxWidth:500}}>{desc}</div>
    </E>
    <E d={d+10} from="right" style={{display:'flex', flexDirection:'column', gap:16, justifyContent:'center'}}>
      {Array.from({length:total}).map((_,i) => (
        <div key={i} style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:12, height:12, borderRadius:6, background: i < step ? C.dim : i === step ? accent : 'transparent', border: i === step ? `2px solid ${accent}` : `1px solid ${C.dim}`}} />
          <span style={{fontSize:14, color: i === step ? '#fff' : C.dim, fontWeight: i === step ? 700 : 400}}>Paso {i+1}</span>
        </div>
      ))}
    </E>
  </Safe>
);
```