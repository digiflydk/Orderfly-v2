'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getQa, updateQa, type QaStatus, type QaContext, type QaTestcase, type QaStepTemplate } from '../actions';
import StepsEditor from '@/components/qa/StepsEditor';

const PUBLIC_PATHS = ['/esmeralda', '/menu', '/cart', '/checkout', '/account', '/search'];
const ADMIN_PATHS  = ['/sales/orders','/customers','/products','/brands','/locations','/discounts','/qa','/ui-validation','/settings'];

export default function QaEditPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [item, setItem] = useState<QaTestcase | null | undefined>(undefined);

  const [title, setTitle] = useState('');
  const [acc, setAcc] = useState('');
  const [status, setStatus] = useState<QaStatus>('Draft');
  const [context, setContext] = useState<QaContext>('public');
  const [startPath, setStartPath] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [steps, setSteps] = useState<QaStepTemplate[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const options = useMemo(() => context === 'public' ? PUBLIC_PATHS : ADMIN_PATHS, [context]);
  const mergedOptions = useMemo(() => {
    // hvis eksisterende startPath ikke er i listen, vis den stadig som valgmulighed
    return startPath && !options.includes(startPath) ? [startPath, ...options] : options;
  }, [options, startPath]);

  useEffect(() => {
    (async () => {
      const t = await getQa(code);
      setItem(t ?? null);
      if (t) {
        setTitle(t.title);
        setAcc(t.acceptanceCriteria);
        setStatus(t.status);
        setContext(t.context);
        setStartPath(t.startPath);
        setProofUrl(t.proofUrl ?? '');
        setSteps(t.stepsTemplate);
      }
    })();
  }, [code]);

  async function onSave() {
    if (!item) return;
    setErr(null);
    if (!title.trim()) return setErr('Udfyld Title');
    if (!acc.trim()) return setErr('Udfyld Acceptance Criteria (samlet)');
    if (!startPath) return setErr('Vælg en Start Path fra dropdown');
    if (!steps.length) return setErr('Tilføj mindst ét step');
    for (const s of steps) {
      if (!s.title.trim() || !s.criteria.trim()) {
        return setErr('Alle steps skal have både Titel og Acceptance (kriterie).');
      }
    }

    await updateQa(code, {
      title: title.trim(),
      acceptanceCriteria: acc.trim(),
      status,
      context,
      startPath,
      proofUrl: proofUrl || undefined,
      stepsTemplate: steps.map((s, i) => ({ ...s, step: i + 1 })),
    });
    router.push('/superadmin/qa');
  }

  if (item === undefined) return <div className="p-6">Henter…</div>;
  if (item === null) return <div className="p-6">Testcase ikke fundet.</div>;

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Redigér testcase · {code}</h1>
      {err && <div className="rounded bg-red-50 p-3 text-red-700">{err}</div>}

      <label className="block text-sm font-medium">Title</label>
      <input className="mt-1 w-full rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} />

      <label className="block text-sm font-medium">Acceptance Criteria (samlet)</label>
      <textarea className="mt-1 w-full rounded border p-2" rows={4} value={acc} onChange={e => setAcc(e.target.value)} />

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
            {mergedOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Steps (ét kriterie pr. step)</label>
        <StepsEditor initial={steps} onChange={setSteps} />
      </div>

      <label className="block text-sm font-medium">Proof URL (valgfrit)</label>
      <input className="mt-1 w-full rounded border p-2" value={proofUrl} onChange={e => setProofUrl(e.target.value)} />

      <div className="pt-4">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>Gem ændringer</button>
      </div>
    </div>
  );
}
