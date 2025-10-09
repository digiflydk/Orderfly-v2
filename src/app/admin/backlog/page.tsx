export const dynamic = 'force-static';

export default function AdminBacklogPage() {
  return (
    <main style={{maxWidth:720,margin:'40px auto',padding:16,fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:22,fontWeight:700}}>Admin Backlog</h1>
      <p style={{opacity:.8,marginTop:6}}>
        Denne side er midlertidigt gjort statisk for at sikre en stabil release.
      </p>
      <a href="/superadmin/dashboard" style={{display:'inline-block',marginTop:14,padding:'10px 14px',borderRadius:8,background:'#111',color:'#fff',textDecoration:'none'}}>
        Til Superadmin
      </a>
      <div style={{marginTop:12,fontSize:12,opacity:.6}}>OF-367</div>
    </main>
  );
}
