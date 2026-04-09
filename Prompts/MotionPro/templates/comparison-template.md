# Template: Comparison

Use this exact structure for comparison animations. Replace data with actual content.

```tsx
// Section: Two cards side by side
const ComparisonSection:React.FC<{d:number}> = ({d}) => (
  <Safe style={{flexDirection:'row', gap:60, justifyContent:'center'}}>
    <E d={d} from="left" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
          {/* Use lucide-react icon */}
          <div style={{fontSize:20, fontWeight:700, color:C.accent}}>Opción A</div>
        </div>
        <div style={{fontSize:16, color:C.dim, lineHeight:1.6}}>Descripción de la primera opción</div>
      </div>
    </E>
    <E d={d+8} from="pop" style={{alignSelf:'center'}}>
      <div style={{width:48, height:48, borderRadius:24, background:C.accent, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:C.bg, fontSize:14}}>VS</div>
    </E>
    <E d={d+15} from="right" style={{flex:1, maxWidth:620}}>
      <div style={{background:C.card, borderRadius:12, border:`1px solid ${C.border}`, padding:24, boxShadow:`0 8px 24px ${C.glow}`}}>
        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:16}}>
          <div style={{fontSize:20, fontWeight:700, color:C.orange}}>Opción B</div>
        </div>
        <div style={{fontSize:16, color:C.dim, lineHeight:1.6}}>Descripción de la segunda opción</div>
      </div>
    </E>
  </Safe>
);
```