# Template: Icons

Use this structure for icon reveal animations. 2-4 items horizontal with stagger.

```tsx
const IconItem:React.FC<{icon:React.ReactNode; label:string; accent:string; d:number}> = ({icon,label,accent,d}) => (
  <E d={d} from="pop" style={{display:'flex', flexDirection:'column', alignItems:'center', gap:16}}>
    <div style={{width:160, height:160, borderRadius:80, background:C.card, border:`1px solid ${accent}33`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 0 24px ${accent}15`}}>
      {icon}
    </div>
    <div style={{fontSize:20, fontWeight:700, color:'#fff', textAlign:'center'}}>{label}</div>
  </E>
);

// Usage in section:
<Safe style={{flexDirection:'row', gap:100, justifyContent:'center'}}>
  <IconItem icon={<Shield size={70} color={C.accent} strokeWidth={1.5}/>} label="Seguridad" accent={C.accent} d={0} />
  <IconItem icon={<Globe size={70} color={C.orange} strokeWidth={1.5}/>} label="Alcance" accent={C.orange} d={12} />
  <IconItem icon={<Zap size={70} color={C.purple} strokeWidth={1.5}/>} label="Velocidad" accent={C.purple} d={24} />
</Safe>
```