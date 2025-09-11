'use client';
import * as React from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error('[global:error]', error?.stack || error);
  }, [error]);
  
  return (
    <html>
      <body>
        <main style={{ padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Global fejl</h1>
          <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: '#f4f4f5', padding: 12, borderRadius: 8 }}>{(error?.stack || String(error))}</pre>
          {error?.digest ? <p style={{ fontSize: '12px', marginTop: '8px' }}>Digest: {error.digest}</p> : null}
          <button onClick={() => reset()} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'black', color: 'white', cursor: 'pointer' }}>Prøv igen</button>
        </main>
      </body>
    </html>
  );
}
