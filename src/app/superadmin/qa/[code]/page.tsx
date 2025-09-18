'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getQa, updateQa, type QaStatus, type QaTestcase } from '../actions';

export default function QaEditPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [item, setItem] = useState<QaTestcase | null>(null);
  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [proofUrl, setProofUrl] = useState('');

  useEffect(() => {
    (async () => {
      const t = await getQa(code);
      if (t) {
        setItem(t);
        setTitle(t.title);
        setAcc(t.acceptanceCriteria);
        setStatus(t.status);
        setProofUrl(t.proofUrl || '');
      } else {
        setItem(null);
      }
    })();
  }, [code]);

  async function onSave() {
    if (!item) return;
    await updateQa(code, {
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      proofUrl: proofUrl || undefined,
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

      <label className="block text-sm font-medium">Acceptance Criteria</label>
      <textarea className="mt-1 w-full rounded border p-2" rows={5} value={acc} onChange={e => setAcc(e.target.value)} />

      <label className="block text-sm font-medium">Status</label>
      <select className="mt-1 w-full rounded border p-2" value={status} onChange={e => setStatus(e.target.value as QaStatus)}>
        <option>Draft</option><option>Ready</option><option>Deprecated</option>
      </select>

      <label className="block text-sm font-medium">Proof URL</label>
      <input className="mt-1 w-full rounded border p-2" value={proofUrl} onChange={e => setProofUrl(e.target.value)} />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>Gem ændringer</button>
      </div>
    </div>
  );
}
