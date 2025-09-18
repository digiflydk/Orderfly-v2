'use client';

import { useRouter } from 'next/navigation';
import { createQa, type QaStatus } from '../actions';
import { useState } from 'react';

export default function QaNewPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [proofUrl, setProofUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function onSave() {
    if (!code.trim() || !title.trim() || !acc.trim()) {
      setErr('Udfyld Code, Title og Acceptance Criteria');
      return;
    }
    await createQa({
      code: code.trim(),
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      proofUrl: proofUrl || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    router.push('/superadmin/qa');
  }

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-semibold">Ny testcase</h1>
      {err && <div className="rounded bg-red-50 p-3 text-red-700">{err}</div>}

      <label className="block text-sm font-medium">Code</label>
      <input className="mt-1 w-full rounded border p-2" value={code} onChange={e => setCode(e.target.value)} placeholder="OFQ-001" />

      <label className="block text-sm font-medium">Title</label>
      <input className="mt-1 w-full rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} />

      <label className="block text-sm font-medium">Acceptance Criteria</label>
      <textarea className="mt-1 w-full rounded border p-2" rows={5} value={acc} onChange={e => setAcc(e.target.value)} />

      <label className="block text-sm font-medium">Status</label>
      <select className="mt-1 w-full rounded border p-2" value={status} onChange={e => setStatus(e.target.value as QaStatus)}>
        <option>Draft</option><option>Ready</option><option>Deprecated</option>
      </select>

      <label className="block text-sm font-medium">Proof URL</label>
      <input className="mt-1 w-full rounded border p-2" value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="https://postimg.cc/..." />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>Opret testcase</button>
      </div>
    </div>
  );
}
