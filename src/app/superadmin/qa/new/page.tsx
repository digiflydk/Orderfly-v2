
'use client';

import { useRouter } from 'next/navigation';
import { createQa } from '../actions';
import { parseStepsInput } from '../qa-utils';
import { useState } from 'react';
import type { QaStatus, QaContext } from '../actions';

export default function QaNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [context, setContext] = useState<QaContext>('public');
  const [startPath, setStartPath] = useState('/esmeralda'); // default
  const [proofUrl, setProofUrl] = useState('');
  const [stepsRaw, setStepsRaw] = useState(
`Menu vises | Menuen skal vise mindst 1 produkt
Læg i kurv | Klik på 'Læg i kurv' viser varen i kurven
Checkout formular | Checkout-formular vises når jeg går til kassen
Gennemfør ordre | Bekræftelsesside vises med ordrenummer`
  );
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    setErr(null);
    if (!title.trim() || !acc.trim()) return setErr('Udfyld Title og Acceptance Criteria');
    if (!startPath.startsWith('/')) return setErr('Start Path skal starte med "/"');

    const code = await createQa({
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      stepsTemplate: parseStepsInput(stepsRaw),
      context,
      startPath: startPath.trim(),
      proofUrl: proofUrl || undefined,
    });
    router.push(`/superadmin/qa/${code}`);
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Ny testcase</h1>
      {err && <div className="rounded bg-red-50 p-3 text-red-700">{err}</div>}

      <label className="block text-sm font-medium">Title</label>
      <input className="mt-1 w-full rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} placeholder="Happy Path – Hele ordre flow" />

      <label className="block text-sm font-medium">Acceptance Criteria (samlet)</label>
      <textarea className="mt-1 w-full rounded border p-2" rows={4} value={acc} onChange={e => setAcc(e.target.value)} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Context</label>
          <select className="mt-1 w-full rounded border p-2" value={context} onChange={e => setContext(e.target.value as QaContext)}>
            <option value="public">public</option>
            <option value="superadmin">superadmin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Start Path</label>
          <input className="mt-1 w-full rounded border p-2" value={startPath} onChange={e => setStartPath(e.target.value)} placeholder="/esmeralda eller /sales/orders" />
        </div>
      </div>

      <label className="block text-sm font-medium">Steps (én pr. linje: Title | Criteria)</label>
      <textarea className="mt-1 w-full rounded border p-2 font-mono" rows={8} value={stepsRaw} onChange={e => setStepsRaw(e.target.value)} />

      <label className="block text-sm font-medium">Proof URL (valgfrit)</label>
      <input className="mt-1 w-full rounded border p-2" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://postimg.cc/..." />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>Opret testcase (kode genereres)</button>
      </div>
    </div>
  );
}
