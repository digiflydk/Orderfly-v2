'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/loyalty/stamp-card/csv';
import { correctMemberAction } from '../../actions';

const ERRORS: Record<string, string> = {
  no_active_stamps: 'Medlemmet har ikke så mange aktive stempler.', reward_not_redeemed: 'Belønningen er ikke indløst.',
  wrong_location: 'Kortet gælder kun i en anden afdeling.', forbidden: 'Du har ikke adgang til manuel korrektion i denne afdeling.',
  invalid_correction: 'Udfyld antal og en årsag på mindst 3 tegn.',
};
const randomKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');

// Only rendered for users with the manual-correction permission in at least one location; the server checks it again.
export function CorrectionPanel({ brandId, memberId, locations, redeemedRewards }: {
  brandId: string; memberId: string; locations: Array<{ id: string; name: string }>; redeemedRewards: Array<{ id: string; description: string; redeemedAt: number | null }>;
}) {
  const router = useRouter(), { toast } = useToast(), [pending, start] = useTransition();
  const [kind, setKind] = useState<'add_stamps' | 'remove_stamps' | 'cancel_redemption'>('add_stamps');
  const [locationId, setLocationId] = useState(locations[0].id), [count, setCount] = useState('1'), [rewardId, setRewardId] = useState(redeemedRewards[0]?.id ?? '');
  const [reason, setReason] = useState(''), [key, setKey] = useState(randomKey);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const base = { brandId, locationId, reason, idempotencyKey: key };
    const input = kind === 'cancel_redemption' ? { ...base, kind, rewardId } : { ...base, kind, memberId, count: Number(count) };
    start(async () => {
      const result = await correctMemberAction(input);
      if (result.ok) {
        toast({ title: 'Korrektionen er registreret' });
        setReason(''); setCount('1'); setKey(randomKey());
        router.refresh();
      } else toast({ variant: 'destructive', title: 'Korrektionen blev ikke gennemført', description: ERRORS[result.error] ?? 'Prøv igen.' });
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2" aria-labelledby="correction-title">
      <div className="md:col-span-2"><h2 id="correction-title" className="font-semibold">Manuel korrektion</h2>
        <p className="text-sm text-muted-foreground">Alle korrektioner logges med dig som medarbejder og den angivne årsag.</p></div>
      <AdminSelectField label="Handling" value={kind} onChange={e => { setKind(e.target.value as typeof kind); setKey(randomKey()); }}>
        <option value="add_stamps">Tilføj stempler</option>
        <option value="remove_stamps">Fjern stempler</option>
        {redeemedRewards.length > 0 && <option value="cancel_redemption">Annullér indløsning</option>}
      </AdminSelectField>
      <AdminSelectField label="Afdeling" value={locationId} onChange={e => setLocationId(e.target.value)}>
        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </AdminSelectField>
      {kind === 'cancel_redemption'
        ? <AdminSelectField label="Indløsning" value={rewardId} onChange={e => setRewardId(e.target.value)}>
            {redeemedRewards.map(r => <option key={r.id} value={r.id}>{r.description} · {formatDateTime(r.redeemedAt)}</option>)}
          </AdminSelectField>
        : <div className="grid gap-1.5"><Label htmlFor="correction-count">Antal stempler</Label>
            <Input id="correction-count" type="number" min={1} max={50} value={count} onChange={e => setCount(e.target.value)} /></div>}
      <div className="grid gap-1.5 md:col-span-2"><Label htmlFor="correction-reason">Årsag (påkrævet)</Label>
        <Textarea id="correction-reason" required minLength={3} maxLength={500} rows={2} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={pending || reason.trim().length < 3}>Registrér korrektion</Button></div>
    </form>
  );
}
