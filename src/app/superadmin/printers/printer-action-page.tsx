'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { PrinterConfiguration } from '@/lib/printing/domain';
import { PrinterConfigurationForm } from './printer-configuration-form';
import { PrinterLifecycleDialog } from './printer-lifecycle-dialog';

type Item = { configuration: PrinterConfiguration; revision: number };
const titles = { edit: 'Rediger printer', deactivate: 'Deaktiver printer', delete: 'Slet printer' };
const states = { active: 'Aktiv', paused: 'Sat på pause', disabled: 'Deaktiveret' };

export function PrinterActionPage({ action, item, brandName, locationName }: {
  action: 'edit' | 'deactivate' | 'delete'; item: Item; brandName: string; locationName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false), [sessionLost, setSessionLost] = useState(false), [saved, setSaved] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const c = item.configuration;
  const base = `/superadmin/printers/${encodeURIComponent(c.brandId)}/${encodeURIComponent(c.locationId)}/${encodeURIComponent(c.id)}`;
  const back = () => { if (!pending) router.push('/superadmin/printers'); };
  const feedback = (_message: string, requiresRefresh: boolean) => setRefreshRequired(requiresRefresh);
  const shared = { item, permitted: !sessionLost && !saved, onPendingChange: setPending, onCancel: back,
    onSessionLost: () => setSessionLost(true), onFeedback: feedback, onSaved: () => setSaved(true) };
  return <main className="mx-auto w-full max-w-3xl space-y-6 min-w-0">
    <div className="space-y-2"><h1 className="text-2xl font-semibold">{titles[action]}</h1>
      <p className="break-words">{brandName} · {locationName}</p>
      {!sessionLost && <p className="text-sm text-muted-foreground break-words">{c.name} · {c.id}{!saved && <> · {states[c.state]}</>}</p>}
    </div>
    {sessionLost ? <p role="alert">Din session er udløbet. Log ind igen.</p>
      : saved ? <section className="space-y-4" aria-label="Printerhandling udført">
        <p role="status">{action === 'edit' ? 'Printeropsætningen er gemt.' : action === 'deactivate' ? 'Printeren er deaktiveret.' : 'Printeren er slettet fra oversigten. Historikken er bevaret.'}</p>
        {action === 'deactivate' && <Link className="underline" href={`${base}/edit`}>Rediger printer</Link>}
      </section>
      : action === 'edit' ? c.state === 'disabled'
        ? <PrinterConfigurationForm {...shared} brandId={c.brandId} locationId={c.locationId} />
        : <section className="rounded-lg border p-4 space-y-3"><p>Deaktiver printeren, før du ændrer opsætningen. Den bliver ikke deaktiveret, når du åbner denne side.</p>
          <Link className="underline" href={`${base}/deactivate`}>Gå til deaktivering</Link></section>
      : action === 'deactivate' && c.state === 'disabled'
        ? <section className="rounded-lg border p-4 space-y-3"><p>Printeren er allerede deaktiveret.</p><Link className="underline" href={`${base}/edit`}>Rediger printer</Link></section>
        : <PrinterLifecycleDialog {...shared} action={action} presentation="page" />}
    {!sessionLost && refreshRequired && <p className="text-sm">Gå tilbage til oversigten for at indlæse printerens aktuelle status, før du prøver igen.</p>}
    <Button variant="outline" type="button" onClick={back} disabled={pending}>Tilbage til printeroversigten</Button>
  </main>;
}
