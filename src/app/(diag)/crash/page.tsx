export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Prod-sikker crash-side: crasher ikke under build/prerender.
// Hvis du vil trigge crash i DEV, sæt NEXT_PUBLIC_ENABLE_CRASH=1.
export default function CrashPage() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_CRASH === '1';

  if (enabled && typeof window !== 'undefined') {
    setTimeout(() => {
      // Crash kun i browser (ikke under build)
      throw new Error('Intentional client crash (diag)');
    }, 0);
    return <pre style={{padding:16}}>Triggering client crash… check console/logs.</pre>;
  }

  return (
    <div style={{padding:16,fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:18,fontWeight:700}}>Diag: Crash</h1>
      <p style={{opacity:.8,marginTop:6}}>
        Crash er <strong>deaktiveret</strong> i dette miljø for at undgå build-fejl.
      </p>
      <code style={{display:'inline-block',marginTop:10,background:'#f6f6f6',padding:'8px 10px',borderRadius:8}}>
        NEXT_PUBLIC_ENABLE_CRASH=1
      </code>
      <div style={{marginTop:12,fontSize:12,opacity:.6}}>OF-362</div>
    </div>
  );
}
