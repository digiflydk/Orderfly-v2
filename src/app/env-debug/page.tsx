export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Prod-sikker env-debug: crasher ikke under build/prerender.
// Aktiver visning af (kun) NEXT_PUBLIC_* variabler ved at sætte NEXT_PUBLIC_ENABLE_ENV_DEBUG=1.
export default function EnvDebugPage() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG === '1';

  if (!enabled) {
    return (
      <div style={{padding:16,fontFamily:'system-ui,sans-serif'}}>
        <h1 style={{fontSize:18,fontWeight:700}}>Env Debug</h1>
        <p style={{opacity:.8,marginTop:6}}>
          Denne side er <strong>deaktiveret</strong> i dette miljø for at undgå build-fejl.
        </p>
        <code style={{display:'inline-block',marginTop:10,background:'#f6f6f6',padding:'8px 10px',borderRadius:8}}>
          NEXT_PUBLIC_ENABLE_ENV_DEBUG=1
        </code>
        <div style={{marginTop:12,fontSize:12,opacity:.6}}>OF-363</div>
      </div>
    );
  }

  // Vis kun sikre, offentliggjorte envs (NEXT_PUBLIC_*)
  const safeEntries = Object.entries(process.env)
    .filter(([k]) => k.startsWith('NEXT_PUBLIC_'))
    .sort(([a],[b]) => a.localeCompare(b));

  return (
    <div style={{padding:16,fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:18,fontWeight:700}}>Env Debug (NEXT_PUBLIC_*)</h1>
      <ul style={{marginTop:10,lineHeight:1.6}}>
        {safeEntries.map(([k, v]) => (
          <li key={k}><code>{k}</code> = <code>{String(v ?? '')}</code></li>
        ))}
      </ul>
      <div style={{marginTop:12,fontSize:12,opacity:.6}}>OF-363</div>
    </div>
  );
}
