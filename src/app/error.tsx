'use client';
import * as React from 'react';
export default function RootError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  React.useEffect(() => { console.error('[root:error]', error?.stack || error); }, [error]);
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-3">Teknisk fejl</h1>
      <details open className="mb-4"><summary>Fejldetaljer</summary>
        <pre className="font-code whitespace-pre-wrap text-sm bg-black/5 p-3 rounded">{(error?.stack || String(error))}</pre>
        {error?.digest ? <p className="text-xs mt-2">Digest: {error.digest}</p> : null}
      </details>
      <button onClick={() => reset()} className="px-4 py-2 rounded bg-black text-white">Prøv igen</button>
    </main>
  );
}
