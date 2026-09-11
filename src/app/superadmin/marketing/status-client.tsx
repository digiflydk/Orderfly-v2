'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
type Job = {
    id: string;
    kind: 'contact' | 'paid_order';
    state: string;
    attempts: number;
    updatedAt: number;
    lastError: string | null;
};
const states: Record<string, string> = { pending: 'Afventer', dispatching: 'Sendes', synced: 'Synkroniseret', accepted: 'Accepteret', failed: 'Fejlet', uncertain: 'Ukendt leveringsstatus', suppressed: 'Afmeldt eller blokeret' };
export function MarketingStatus() {
    const [brandId, setBrandId] = useState(''), [jobs, setJobs] = useState<Job[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [configured, setConfigured] = useState<boolean | null>(null);
    async function load() {
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`/api/superadmin/marketing?${new URLSearchParams({ brandId })}`, { cache: 'no-store' }), data = await response.json();
            if (!response.ok)
                throw new Error(data.error || 'Status kunne ikke indlæses.');
            setJobs(data.jobs);
            setConfigured(data.configured);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Status kunne ikke indlæses.');
        }
        finally {
            setBusy(false);
        }
    }
    async function retry(job: Job) {
        setBusy(true);
        try {
            const r = await fetch('/api/superadmin/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, id: job.id, kind: job.kind }) });
            if (!r.ok || !(await r.json()).success)
                throw new Error();
            await load();
        }
        catch {
            setError('Genforsøget kunne ikke startes.');
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="p-6 space-y-5"><h1 className="text-2xl font-bold">Nyhedsbrev og Omnisend</h1><p>Samtykke indsamles ved checkout. Synkronisering kører separat fra betalingen.</p>
    <form onSubmit={e => { e.preventDefault(); void load(); }} className="flex gap-3 max-w-lg"><label className="flex-1">Brand-ID<Input disabled={busy} value={brandId} onChange={e => { setBrandId(e.target.value); setJobs([]); setConfigured(null); }} required/></label><Button className="self-end" disabled={busy}>Vis status</Button></form>
    {error && <p role="alert">{error}</p>}{configured === false && <p>Omnisend er ikke aktiveret for dette brand. Samtykker afventer opsætning.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Type</th><th>Reference</th><th>Status</th><th>Forsøg</th><th>Opdateret</th><th>Handling</th></tr></thead><tbody>{jobs.map(job => <tr key={`${job.kind}-${job.id}`} className="border-t"><td className="py-3">{job.kind === 'paid_order' ? 'Betalt ordre' : 'Samtykke'}</td><td>{job.id.slice(0, 12)}</td><td>{states[job.state] || job.state}{job.lastError && <p className="text-xs">{job.lastError}</p>}</td><td>{job.attempts}</td><td>{new Date(job.updatedAt).toLocaleString('da-DK')}</td><td>{job.state === 'failed' && <Button variant="outline" disabled={busy} onClick={() => retry(job)}>Prøv igen</Button>}</td></tr>)}</tbody></table></div>
  </div>;
}
