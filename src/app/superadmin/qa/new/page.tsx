'use client';

import { useRouter } from 'next/navigation';
import { createQa, type QaStatus, type QaContext, type QaStepTemplate } from '../actions';
import { useMemo, useState } from 'react';
import StepsEditor from '@/components/qa/StepsEditor';

const PUBLIC_PATHS = ['/esmeralda', '/menu', '/cart', '/checkout', '/account', '/search'];
const ADMIN_PATHS  = ['/sales/orders','/customers','/products','/brands','/locations','/discounts','/qa','/ui-validation','/settings'];

export default function QaNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [context, setContext] = useState<QaContext>('public');
  const [startPath, setStartPath] = useState(''); // TOM som default
  const [proofUrl, setProofUrl] = useState('');
  const [steps, setSteps] = useState<QaStepTemplate[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(() => context === 'public' ? PUBLIC_PATHS : ADMIN_PATHS, [context]);

  async function onSave() {
    setErr(null);
    if (!title.trim()) return setErr('Udfyld Title');
    if (!acc.trim()) return setErr('Udfyld Acceptance Criteria (samlet)');
    if (!startPath) return setErr('Vælg en Start Path fra dropdown');
    if (!steps.length) return setErr('Tilføj mindst ét step');

    // valider hver step
    for (const s of steps) {
      if (!s.title.trim() || !s.criteria.trim()) {
        return setErr('Alle steps skal have både Titel og Acceptance (kriterie).');
      }
    }

    const code = await createQa({
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      stepsTemplate: steps.map((s, i) => ({ ...s, step: i + 1 })),
      context,
      startPath,
      proofUrl: proofUrl || undefined,
    });
    router.push(`/superadmin/qa/${code}`);
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Ny testcase</h1>
      {err && <div className="rounded bg-red-50 p-3 text-red-700">{err}</div>}

      <label className="block text-sm font-medium">Title</label>
      <input
        className="mt-1 w-full rounded border p-2 placeholder:text-gray-400"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Hele ordreflow (esmeralda)"
      />

      <label className="block text-sm font-medium">Acceptance Criteria (samlet)</label>
      <textarea
        className="mt-1 w-full rounded border p-2 placeholder:text-gray-400"
        rows={4}
        value={acc}
        onChange={e => setAcc(e.target.value)}
        placeholder="Beskriv samlet målsætning for casen – hvad betyder 'bestået' overordnet?"
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Context</label>
          <select
            className="mt-1 w-full rounded border p-2"
            value={context}
            onChange={e => { setContext(e.target.value as QaContext); setStartPath(''); }}
          >
            <option value="public">public</option>
            <option value="superadmin">superadmin</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Start Path</label>
          <select
            className="mt-1 w-full rounded border p-2"
            value={startPath}
            onChange={e => setStartPath(e.target.value)}
          >
            <option value="">Vælg side…</option>
            {options.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Steps (ét kriterie pr. step)</label>
        <p className="text-xs text-gray-500 mb-2">Hvert step har egen titel og acceptance. Agenten sætter status pr. step på Run-siden.</p>
        <StepsEditor onChange={setSteps} />
      </div>

      <label className="block text-sm font-medium">Proof URL (valgfrit)</label>
      <input
        className="mt-1 w-full rounded border p-2 placeholder:text-gray-400"
        value={proofUrl}
        onChange={e => setProofUrl(e.target.value)}
        placeholder="https://postimg.cc/..."
      />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>
          Opret testcase (kode genereres)
        </button>
      </div>
    </div>
  );
}
