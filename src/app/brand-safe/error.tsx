'use client';
export default function BrandSafeError({ error, reset }: { error:any; reset:()=>void }) {
  console.error('Brand Safe error:', error);
  return (
    <div style={{maxWidth:640,margin:'40px auto',padding:16,fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:20,fontWeight:600}}>Noget gik galt (Brand Safe)</h1>
      <button onClick={()=>reset()} style={{marginTop:16,padding:'8px 12px',border:'1px solid #111',background:'#111',color:'#fff',borderRadius:6,cursor:'pointer'}}>Prøv igen</button>
    </div>
  );
}
