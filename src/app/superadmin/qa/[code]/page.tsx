
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getQa, updateQa, type QaStatus, type QaContext, type QaTestcase } from '../actions';
import { stringifySteps, parseStepsInput } from '../qa-utils';

export default function QaEditPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [item, setItem] = useState<QaTestcase | null>(null);
  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [proofUrl, setProofUrl] = useState('');
  const [context, setContext] = useState<QaContext>('public');
  const [startPath, setStartPath] = useState('/');

  const [stepsRaw, setStepsRaw] = useState('');

  useEffect(() => {
    (async () => {
      const t = await getQa(code);
      if (t) {
        setItem(t);
        setTitle(t.title);
        setAcc(t.acceptanceCriteria);
        setStatus(t.status);
        setProofUrl(t.proofUrl || '');
        setContext(t.context);
        setStartPath(t.startPath);
        setStepsRaw(stringifySteps(t.stepsTemplate));
      } else setItem(null);
    })();
  }, [code]);

  async function onSave() {
    if (!item) return;
    if (!startPath.startsWith('/')) {
      alert('startPath skal starte med "/"');
      return;
    }
    await updateQa(code, {
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      proofUrl: proofUrl || undefined,
      context,
      startPath: startPath.trim(),
      stepsTemplate: parseStepsInput(stepsRaw),
    });
    router.push('/superadmin/qa');
  }

  if (item === null) return <div className="p-6">Testcase ikke fundet.</div>;
  if (!item) return <div className="p-6">Henter…</div>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Redigér testcase · {code}</h1>

      <label className="block text-sm font-medium">Title</label>
      <input className="mt-1 w-full rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} />

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
          <input className="mt-1 w-full rounded border p-2" value={startPath} onChange={e => setStartPath(e.target.value)} />
        </div>
      </div>

      <label className="block text-sm font-medium">Steps (én pr. linje: Title | Criteria)</label>
      <textarea className="mt-1 w-full rounded border p-2 font-mono" rows={8} value={stepsRaw} onChange={e => setStepsRaw(e.target.value)} />

      <label className="block text-sm font-medium">Proof URL (valgfrit)</label>
      <input className="mt-1 w-full rounded border p-2" value={proofUrl} onChange={e => setProofUrl(e.target.value)} />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>Gem ændringer</button>
      </div>
    </div>
  );
}
