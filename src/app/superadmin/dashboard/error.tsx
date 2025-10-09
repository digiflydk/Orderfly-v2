
'use client';
export default function DashboardError({ error, reset }:{ error:any; reset:()=>void }) {
  console.error('Dashboard error:', error);
  return (
    <div style={{maxWidth:640,margin:'40px auto',padding:16,fontFamily:'system-ui,sans-serif'}}>
      <h2 style={{fontSize:18,fontWeight:600}}>Dashboard-fejl</h2>
      <pre style={{whiteSpace:'pre-wrap',background:'#f6f6f6',padding:12,borderRadius:8,marginTop:8}}>
{String(error?.message || error)}
</pre>
<button onClick={()=>reset()} style={{marginTop:12,padding:'8px 12px',borderRadius:6,background:'#111',color:'#fff',border:'1px solid #111'}}>
Genindlæs dashboard
</button>
</div>
);
}
