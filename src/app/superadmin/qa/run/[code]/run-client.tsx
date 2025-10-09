
'use client';

import { useState } from 'react';
import type { QaRun } from '../actions';
import { setStepStatus, finishRun } from '../actions';
import { CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

function fmt(d?: number) {
  return d ? new Date(d).toLocaleString('da-DK') : '—';
}

export default function RunClient({ run }: { run: QaRun }) {
  const [state, setState] = useState(run);

  async function updateStep(i: number, status: 'Approved'|'Failed', errorNote?: string, proofUrl?: string) {
    await setStepStatus(state.runId, i, status, errorNote, proofUrl);
    const next = { ...state };
    next.steps[i] = { ...next.steps[i], status, errorNote, proofUrl };
    setState(next);
  }

  async function onFinish() {
    await finishRun(state.runId);
    setState(s => ({ ...s, finishedAt: Date.now() }));
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Run: {state.code}</h1>
          <div className="text-sm text-gray-600 mt-1">
            Context: <b>{state.context}</b> · Start Path: <code>{state.startPath}</code>
          </div>
          <div className="text-sm mt-1">
            Start-URL:{' '}
            <a className="inline-flex items-center gap-1 text-blue-600 underline" target="_blank" href={state.startUrl}>
              {state.startUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <div className="text-sm mt-1">
            Started: <b>{fmt(state.startedAt)}</b> · Completed: <b>{fmt(state.finishedAt)}</b>
          </div>
        </div>
        <button className="rounded-md bg-black px-3 py-2 text-white" onClick={onFinish}>
          Markér run som færdigt
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">#</th>
              <th className="p-2 text-left">Step</th>
              <th className="p-2 text-left">Acceptance</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Error note</th>
              <th className="p-2 text-left">Proof URL</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.steps.map((s, i) => (
              <tr key={i} className="border-t align-top">
                <td className="p-2">{s.step}</td>
                <td className="p-2 font-medium">{s.title}</td>
                <td className="p-2">{s.criteria}</td>
                <td className="p-2">{s.status}</td>
                <td className="p-2">{s.status === 'Failed' ? (s.errorNote ?? '—') : '—'}</td>
                <td className="p-2">
                  {s.status === 'Failed' ? (s.proofUrl ? <a className="text-blue-600 underline" href={s.proofUrl} target="_blank">Åbn</a> : '—') : '—'}
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="inline-flex items-center gap-1 rounded border px-2 py-1" onClick={() => updateStep(i, 'Approved')}>
                      <CheckCircle2 className="h-4 w-4" /> Approved
                    </button>
                    <FailEditor onSubmit={(note, url) => updateStep(i, 'Failed', note, url)} />
                  </div>
                </td>
              </tr>
            ))}
            {state.steps.length === 0 && <tr><td className="p-2" colSpan={7}>Ingen steps.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FailEditor({ onSubmit }: { onSubmit: (note: string, url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');

  return (
    <div>
      {!open ? (
        <button className="inline-flex items-center gap-1 rounded border px-2 py-1" onClick={() => setOpen(true)}>
          <XCircle className="h-4 w-4" /> Failed
        </button>
      ) : (
        <div className="space-y-2 border rounded p-2">
          <input className="w-full rounded border p-1" placeholder="Fejlbeskrivelse…" value={note} onChange={e => setNote(e.target.value)} />
          <input className="w-full rounded border p-1" placeholder="Proof URL (postimg.cc…)" value={url} onChange={e => setUrl(e.target.value)} />
          <div className="flex gap-2">
            <button className="rounded bg-red-600 px-2 py-1 text-white" onClick={() => { onSubmit(note, url); setOpen(false); }}>Gem Failed</button>
            <button className="rounded border px-2 py-1" onClick={() => setOpen(false)}>Annullér</button>
          </div>
        </div>
      )}
    </div>
  );
}
