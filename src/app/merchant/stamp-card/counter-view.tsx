'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Gift, Mail, QrCode, Stamp } from 'lucide-react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { cn } from '@/lib/utils';
import { FRESH_LOGIN_KEY, LockScreen } from './lock-screen';
import { QrScanner } from './qr-scanner';
import { CHANNEL_LABELS, errorMessage, isUncertain, kr, newIdempotencyKey, parseAmountOre, shortDate } from './messages';

export type CounterBrand = {
  id: string; name: string; locations: Array<{ id: string; name: string }>;
  program: { active: boolean; name: string; counterChannels: string[]; idleMinutes: number };
};
type Lookup = {
  via: 'qr' | 'search';
  member: { id: string; name: string; maskedEmail: string };
  card: { stamps: number; stampsRequired: number; expiresAt: number | null };
  rewards: Array<{ id: string; description: string; expiresAt: number; redeemableHere: boolean }>;
  program: { active: boolean; name: string; counterChannels: string[]; minimumAmountOre: number; discountedOrdersQualify: boolean };
  permissions: { redeem: boolean; correct: boolean };
};
type Scope = { brandId: string; locationId: string };
type Screen =
  | { kind: 'start'; error?: string } | { kind: 'scan' } | { kind: 'search' }
  | { kind: 'member'; m: Lookup } | { kind: 'stamp'; m: Lookup } | { kind: 'redeem'; m: Lookup } | { kind: 'correct'; m: Lookup }
  | { kind: 'receipt'; title: string; detail?: string };
type Result<T> = { ok: true; data: T } | { ok: false; code: string };

const SCOPE_KEY = 'orderfly.counter.scope', ACTIVITY_KEY = 'orderfly.counter.activity', LOCKED_KEY = 'orderfly.counter.locked';
const RECEIPT_MS = 4000;
const store = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* Private mode. */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* Private mode. */ } },
};

async function post<T>(path: string, body: object): Promise<Result<T>> {
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, data } : { ok: false, code: typeof data?.error === 'string' ? data.error : 'unavailable' };
  } catch { return { ok: false, code: 'network' }; }
}

const big = 'h-16 text-xl';

export function CounterView({ employee, brands, adminHref }: { employee: { id: string; name: string }; brands: CounterBrand[]; adminHref: string | null }) {
  const [scope, setScope] = useState<Scope | null>(brands[0] ? { brandId: brands[0].id, locationId: brands[0].locations[0].id } : null);
  const [screen, setScreen] = useState<Screen>({ kind: 'start' });
  const [locked, setLocked] = useState<{ message?: string } | null>(null);
  const brand = brands.find(b => b.id === scope?.brandId) ?? null;
  const location = brand?.locations.find(l => l.id === scope?.locationId) ?? null;
  const idleMs = (brand?.program.idleMinutes ?? 5) * 60_000;
  const counterOpen = !!brand?.program.active && brand.program.counterChannels.length > 0;

  const lock = useCallback((message?: string) => {
    setLocked({ message });
    store.set(LOCKED_KEY, employee.id);
    // The lock screen stays until the next login; a failed logout is retried on the next load.
    fetch('/api/admin/session', { method: 'DELETE' }).then(r => { if (r.ok) store.remove(LOCKED_KEY); }).catch(() => {});
  }, [employee.id]);

  // Remembered brand and location for this tablet.
  useEffect(() => {
    try {
      const saved = JSON.parse(store.get(SCOPE_KEY) || 'null') as Scope | null;
      const b = brands.find(x => x.id === saved?.brandId), l = b?.locations.find(x => x.id === saved?.locationId);
      if (b) setScope({ brandId: b.id, locationId: (l ?? b.locations[0]).id });
    } catch { /* Defaults stay selected. */ }
  }, [brands]);
  const choose = (next: Scope) => { setScope(next); store.set(SCOPE_KEY, JSON.stringify(next)); setScreen({ kind: 'start' }); };

  // Automatic logout after the brand's idle period, also across sleep and reloads.
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    const touch = () => { lastActivity.current = Date.now(); store.set(ACTIVITY_KEY, JSON.stringify({ id: employee.id, at: lastActivity.current })); };
    let fresh = false;
    try { fresh = sessionStorage.getItem(FRESH_LOGIN_KEY) === '1'; sessionStorage.removeItem(FRESH_LOGIN_KEY); } catch { /* Not available. */ }
    const pendingLock = store.get(LOCKED_KEY);
    if (fresh || (pendingLock && pendingLock !== employee.id)) store.remove(LOCKED_KEY);
    else if (pendingLock === employee.id) { lock(); return; }
    let saved: { id?: string; at?: number } | null = null;
    try { saved = JSON.parse(store.get(ACTIVITY_KEY) || 'null'); } catch { /* Treated as fresh. */ }
    if (!fresh && saved?.id === employee.id && typeof saved.at === 'number') lastActivity.current = saved.at; else touch();
    let throttle = 0;
    const onActivity = () => { if (Date.now() - throttle > 5000) { throttle = Date.now(); touch(); } else lastActivity.current = Date.now(); };
    const check = () => { if (Date.now() - lastActivity.current >= idleMs) lock(`Du blev logget ud efter ${idleMs / 60_000} minutter uden aktivitet.`); };
    check();
    const timer = setInterval(check, 10_000);
    window.addEventListener('pointerdown', onActivity); window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer); window.removeEventListener('pointerdown', onActivity); window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', check);
    };
  }, [employee.id, idleMs, lock]);

  // Receipts return to the start screen by themselves.
  useEffect(() => {
    if (screen.kind !== 'receipt') return;
    const timer = setTimeout(() => setScreen({ kind: 'start' }), RECEIPT_MS);
    return () => clearTimeout(timer);
  }, [screen]);

  // Every failure leaves nothing registered; a lost session goes to the lock screen.
  const fail = (code: string) => { if (code === 'unauthorized') lock(errorMessage(code)); return errorMessage(code); };

  async function lookup(body: { qrToken: string } | { email: string }): Promise<string | null> {
    if (!scope) return null;
    const result = await post<Lookup>('/api/merchant/loyalty/lookup', { ...scope, ...body });
    if (result.ok) { setScreen({ kind: 'member', m: result.data }); return null; }
    return fail(result.code);
  }

  if (locked) return <LockScreen message={locked.message} />;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 p-4 text-foreground md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Registrerer som</p>
          <p className="truncate text-xl font-bold" data-testid="counter-employee">{employee.name}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {brands.length > 1 && (
            <AdminSelectField label="Brand" value={scope?.brandId} className="h-12 text-base"
              onChange={e => { const b = brands.find(x => x.id === e.target.value)!; choose({ brandId: b.id, locationId: b.locations[0].id }); }}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </AdminSelectField>
          )}
          {brand && brand.locations.length > 1 && (
            <AdminSelectField label="Afdeling" value={scope?.locationId} className="h-12 text-base" onChange={e => choose({ brandId: brand.id, locationId: e.target.value })}>
              {brand.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </AdminSelectField>
          )}
          {brand && brands.length === 1 && brand.locations.length === 1 && <p className="pb-2 text-base">{brand.name} · {location?.name}</p>}
          {adminHref && <Button asChild variant="outline" className="h-12 text-base"><Link href={adminHref}>Administration</Link></Button>}
          <Button variant="outline" className="h-12 text-base" onClick={() => lock()}>Skift bruger</Button>
        </div>
      </header>

      {!brand || !scope ? (
        <p role="alert" className="rounded-xl border bg-muted p-6 text-lg">Du har ikke adgang til stempelkortet i en aktiv afdeling. Bed din leder om adgang.</p>
      ) : (
        <main className="flex-1">
          {screen.kind === 'start' && (
            <section className="grid gap-4" aria-label="Start">
              {!counterOpen && (
                <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-lg font-medium text-destructive">
                  {brand.program.active ? `${brand.program.name} giver ikke stempler ved kassen.` : `${brand.program.name} er slået fra.`} Der kan ikke gives stempler eller indløses.
                </p>
              )}
              {screen.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-lg text-destructive">{screen.error}</p>}
              <Button className="h-32 gap-4 text-3xl" disabled={!counterOpen} onClick={() => setScreen({ kind: 'scan' })}><QrCode className="!h-10 !w-10" />Scan QR-kode</Button>
              <Button variant="outline" className="h-20 gap-3 text-xl" disabled={!counterOpen} onClick={() => setScreen({ kind: 'search' })}><Mail className="!h-6 !w-6" />Søg kunde på e-mail</Button>
            </section>
          )}
          {screen.kind === 'scan' && <ScanStep onLookup={lookup} onBack={() => setScreen({ kind: 'start' })} onError={error => setScreen({ kind: 'start', error })} />}
          {screen.kind === 'search' && <SearchStep onLookup={lookup} onBack={() => setScreen({ kind: 'start' })} />}
          {screen.kind === 'member' && <MemberCard m={screen.m} onDone={() => setScreen({ kind: 'start' })}
            onStamp={() => setScreen({ kind: 'stamp', m: screen.m })} onRedeem={() => setScreen({ kind: 'redeem', m: screen.m })} onCorrect={() => setScreen({ kind: 'correct', m: screen.m })} />}
          {screen.kind === 'stamp' && <StampStep m={screen.m} scope={scope} fail={fail} onBack={() => setScreen({ kind: 'member', m: screen.m })} onDone={(title, detail) => setScreen({ kind: 'receipt', title, detail })} />}
          {screen.kind === 'redeem' && <RedeemStep m={screen.m} scope={scope} fail={fail} onBack={() => setScreen({ kind: 'member', m: screen.m })} onDone={(title, detail) => setScreen({ kind: 'receipt', title, detail })} />}
          {screen.kind === 'correct' && <CorrectStep m={screen.m} scope={scope} fail={fail} onBack={() => setScreen({ kind: 'member', m: screen.m })} onDone={(title, detail) => setScreen({ kind: 'receipt', title, detail })} />}
          {screen.kind === 'receipt' && (
            <section role="status" className="grid place-items-center gap-4 rounded-2xl border bg-background p-10 text-center">
              <CheckCircle2 className="h-20 w-20 text-primary" aria-hidden />
              <p className="text-3xl font-bold">{screen.title}</p>
              {screen.detail && <p className="text-xl">{screen.detail}</p>}
              <Button className={cn(big, 'mt-4 w-full max-w-sm')} onClick={() => setScreen({ kind: 'start' })}>Næste kunde</Button>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

function ScanStep({ onLookup, onBack, onError }: { onLookup: (b: { qrToken: string }) => Promise<string | null>; onBack: () => void; onError: (e: string) => void }) {
  const [pending, setPending] = useState(false);
  return (
    <section className="grid gap-4" aria-label="Scan QR-kode">
      {pending ? <p role="status" className="p-10 text-center text-2xl">Slår kunden op…</p> : (
        <QrScanner onToken={async token => { setPending(true); const error = await onLookup({ qrToken: token }); if (error) onError(error); }} />
      )}
      <Button variant="outline" className={big} onClick={onBack} disabled={pending}>Tilbage</Button>
    </section>
  );
}

function SearchStep({ onLookup, onBack }: { onLookup: (b: { email: string }) => Promise<string | null>; onBack: () => void }) {
  const [email, setEmail] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  return (
    <form className="grid gap-4" aria-label="Søg kunde" onSubmit={async event => {
      event.preventDefault(); if (pending || !email.trim()) return;
      setPending(true); setError(''); setError((await onLookup({ email: email.trim() })) ?? ''); setPending(false);
    }}>
      <Label htmlFor="counter-email" className="text-lg">Kundens e-mail</Label>
      <Input id="counter-email" type="email" inputMode="email" autoComplete="off" autoFocus maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="h-16 text-xl" />
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{error}</p>}
      <Button type="submit" className={big} disabled={pending || !email.trim()}>{pending ? 'Søger…' : 'Søg'}</Button>
      <Button type="button" variant="outline" className={big} onClick={onBack} disabled={pending}>Tilbage</Button>
    </form>
  );
}

function MemberCard({ m, onStamp, onRedeem, onCorrect, onDone }: { m: Lookup; onStamp: () => void; onRedeem: () => void; onCorrect: () => void; onDone: () => void }) {
  const redeemable = m.rewards.filter(r => r.redeemableHere);
  const canStamp = m.program.active && m.program.counterChannels.length > 0;
  return (
    <section className="grid gap-4" aria-label="Kundekort">
      <div className="rounded-2xl border bg-background p-5">
        <p className="text-3xl font-bold" data-testid="member-name">{m.member.name || 'Medlem'}</p>
        {m.via === 'search' && <p className="mt-1 text-lg text-muted-foreground">{m.member.maskedEmail}</p>}
        <p className="mt-4 text-2xl font-semibold" data-testid="member-stamps">Stempler {m.card.stamps} af {m.card.stampsRequired}</p>
        <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
          {Array.from({ length: m.card.stampsRequired }, (_, i) => (
            <span key={i} className={cn('flex h-10 w-10 items-center justify-center rounded-full border-2', i < m.card.stamps ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
              {i < m.card.stamps && <Stamp className="h-5 w-5" />}
            </span>
          ))}
        </div>
        {m.rewards.length > 0 && (
          <ul className="mt-5 grid gap-2">
            {m.rewards.map(r => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg bg-muted p-3 text-lg">
                <Gift className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span className="font-medium">{r.description}</span>
                <span className="ml-auto text-base text-muted-foreground">{r.redeemableHere ? `Udløber ${shortDate(r.expiresAt)}` : 'Kan ikke indløses i denne afdeling'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!canStamp && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{errorMessage('program_inactive')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button className="h-24 text-2xl" disabled={!canStamp} onClick={onStamp}>Giv stempel</Button>
        {redeemable.length > 0 && m.permissions.redeem && m.program.active && <Button variant="secondary" className="h-24 text-2xl" onClick={onRedeem}>Indløs belønning</Button>}
      </div>
      {m.permissions.correct && <Button variant="outline" className={big} onClick={onCorrect}>Manuel korrektion</Button>}
      <Button variant="ghost" className={big} onClick={onDone}>Afslut</Button>
    </section>
  );
}

type StepProps = { m: Lookup; scope: Scope; fail: (code: string) => string; onBack: () => void; onDone: (title: string, detail?: string) => void };

// Runs one counter action: the button locks at the first tap, and after an uncertain
// failure only a retry with the same key and the same values is offered.
function useAction<T>(path: string) {
  const [key] = useState(newIdempotencyKey);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const run = async (body: object, fail: (code: string) => string, minimumAmountOre?: number): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true; setPending(true); setError('');
    const result = await post<T>(path, { ...body, idempotencyKey: key });
    busy.current = false; setPending(false);
    if (result.ok) return result.data;
    setUncertain(isUncertain(result.code));
    setError(result.code === 'below_minimum' ? errorMessage(result.code, minimumAmountOre) : fail(result.code));
    return null;
  };
  return { run, pending, error, uncertain };
}

function StampStep({ m, scope, fail, onBack, onDone }: StepProps) {
  const channels = m.program.counterChannels;
  const [channel, setChannel] = useState(channels.length === 1 ? channels[0] : '');
  const [amount, setAmount] = useState(''), [discount, setDiscount] = useState(false);
  const action = useAction<{ stamps: number; stampsRequired: number; rewardsEarned: number }>('/api/merchant/loyalty/stamp');
  const amountOre = parseAmountOre(amount);
  const belowMinimum = amountOre !== null && amountOre < m.program.minimumAmountOre;
  const frozen = action.pending || action.uncertain;
  const ready = !!channel && amountOre !== null && !belowMinimum && !(discount && !m.program.discountedOrdersQualify);

  async function confirm() {
    if (!ready) return;
    const outcome = await action.run({ ...scope, memberId: m.member.id, channel, amountOre, discountUsed: discount, via: m.via }, fail, m.program.minimumAmountOre);
    if (!outcome) return;
    if (outcome.rewardsEarned > 0) onDone('Kortet er fyldt – belønning optjent', `Nyt kort: ${outcome.stamps} af ${outcome.stampsRequired}`);
    else onDone(`Stempel givet – ${outcome.stamps} af ${outcome.stampsRequired}`);
  }

  return (
    <form className="grid gap-5" aria-label="Giv stempel" onSubmit={event => { event.preventDefault(); confirm(); }}>
      <p className="text-2xl font-bold">Giv stempel til {m.member.name || 'medlem'}</p>
      <fieldset className="grid gap-2" disabled={frozen}>
        <legend className="mb-2 text-lg font-medium">Kanal</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {channels.map(c => (
            <Button key={c} type="button" variant={channel === c ? 'default' : 'outline'} aria-pressed={channel === c} className="h-20 text-2xl" onClick={() => setChannel(c)}>{CHANNEL_LABELS[c] ?? c}</Button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor="counter-amount" className="text-lg">Købsbeløb inkl. moms (kr.)</Label>
        <Input id="counter-amount" inputMode="decimal" autoComplete="off" autoFocus={channels.length === 1} disabled={frozen} value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="0" className="h-20 text-4xl" aria-invalid={belowMinimum} />
        {m.program.minimumAmountOre > 0 && <p className="text-base text-muted-foreground">Minimum {kr(m.program.minimumAmountOre)} kr.</p>}
        {belowMinimum && <p role="alert" className="text-lg font-medium text-destructive">{errorMessage('below_minimum', m.program.minimumAmountOre)}</p>}
      </div>
      {!m.program.discountedOrdersQualify && (
        <label className="flex min-h-16 items-center gap-4 rounded-xl border p-4 text-lg">
          <input type="checkbox" className="h-7 w-7" checked={discount} disabled={frozen} onChange={e => setDiscount(e.target.checked)} />
          Rabat eller kampagne brugt
        </label>
      )}
      {discount && !m.program.discountedOrdersQualify && <p role="alert" className="text-lg font-medium text-destructive">{errorMessage('discount_excluded')}</p>}
      {action.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{action.error}</p>}
      <Button type="submit" className="h-20 text-2xl" disabled={!ready || action.pending}>{action.pending ? 'Registrerer…' : action.uncertain ? 'Prøv igen' : 'Bekræft'}</Button>
      <Button type="button" variant="outline" className={big} disabled={action.pending} onClick={onBack}>{action.uncertain ? 'Annullér' : 'Tilbage'}</Button>
    </form>
  );
}

function RedeemStep({ m, scope, fail, onBack, onDone }: StepProps) {
  const rewards = m.rewards.filter(r => r.redeemableHere);
  const [selected, setSelected] = useState(rewards.length === 1 ? rewards[0] : null);
  const [confirming, setConfirming] = useState(false);
  const action = useAction<{ description: string }>('/api/merchant/loyalty/redeem');

  async function redeem() {
    if (!selected) return;
    const outcome = await action.run({ ...scope, rewardId: selected.id, via: m.via }, fail);
    if (outcome) onDone('Belønning indløst', outcome.description || selected.description);
  }

  if (!selected) return (
    <section className="grid gap-3" aria-label="Vælg belønning">
      <p className="text-2xl font-bold">Vælg belønning</p>
      {rewards.map(r => <Button key={r.id} variant="outline" className="h-20 justify-between text-xl" onClick={() => setSelected(r)}><span>{r.description}</span><span className="text-base text-muted-foreground">Udløber {shortDate(r.expiresAt)}</span></Button>)}
      <Button variant="outline" className={big} onClick={onBack}>Tilbage</Button>
    </section>
  );
  return (
    <section className="grid gap-4" aria-label="Indløs belønning">
      <div className="rounded-2xl border bg-background p-6 text-center">
        <Gift className="mx-auto h-14 w-14 text-primary" aria-hidden />
        <p className="mt-3 text-3xl font-bold">{selected.description}</p>
        <p className="mt-2 text-lg text-muted-foreground">{m.member.name} · udløber {shortDate(selected.expiresAt)}</p>
      </div>
      {action.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{action.error}</p>}
      {!confirming ? (
        <Button className="h-20 text-2xl" onClick={() => setConfirming(true)}>Indløs</Button>
      ) : (
        <div className="grid gap-3 rounded-xl border-2 border-primary p-4">
          <p className="text-xl font-medium">Er du sikker? Belønningen kan kun indløses én gang.</p>
          <Button className="h-20 text-2xl" disabled={action.pending} onClick={redeem}>{action.pending ? 'Indløser…' : action.uncertain ? 'Prøv igen' : 'Bekræft indløsning'}</Button>
        </div>
      )}
      <Button variant="outline" className={big} disabled={action.pending} onClick={() => (confirming && !action.uncertain ? setConfirming(false) : onBack())}>{action.uncertain ? 'Annullér' : 'Tilbage'}</Button>
    </section>
  );
}

function CorrectStep({ m, scope, fail, onBack, onDone }: StepProps) {
  const [kind, setKind] = useState<'add_stamps' | 'remove_stamps'>('add_stamps');
  const [count, setCount] = useState(1), [reason, setReason] = useState('');
  const action = useAction<{ stamps: number; stampsRequired: number; rewardsEarned?: number }>('/api/merchant/loyalty/correct');
  const frozen = action.pending || action.uncertain;
  const ready = reason.trim().length >= 3;

  async function save() {
    if (!ready) return;
    const outcome = await action.run({ ...scope, kind, memberId: m.member.id, count, reason: reason.trim() }, fail);
    if (!outcome) return;
    onDone(outcome.rewardsEarned ? 'Kortet er fyldt – belønning optjent' : 'Korrektion gemt', `Stempler ${outcome.stamps} af ${outcome.stampsRequired}`);
  }

  return (
    <form className="grid gap-5" aria-label="Manuel korrektion" onSubmit={event => { event.preventDefault(); save(); }}>
      <p className="text-2xl font-bold">Manuel korrektion · {m.member.name}</p>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={frozen}>
        <legend className="sr-only">Type</legend>
        <Button type="button" variant={kind === 'add_stamps' ? 'default' : 'outline'} aria-pressed={kind === 'add_stamps'} className={big} onClick={() => setKind('add_stamps')}>Tilføj stempler</Button>
        <Button type="button" variant={kind === 'remove_stamps' ? 'default' : 'outline'} aria-pressed={kind === 'remove_stamps'} className={big} onClick={() => setKind('remove_stamps')}>Fjern stempler</Button>
      </fieldset>
      <div className="flex items-center gap-4">
        <Button type="button" variant="outline" className="h-16 w-16 text-3xl" disabled={frozen || count <= 1} onClick={() => setCount(c => c - 1)} aria-label="Færre">−</Button>
        <p className="min-w-24 text-center text-3xl font-bold" aria-live="polite">{count}</p>
        <Button type="button" variant="outline" className="h-16 w-16 text-3xl" disabled={frozen || count >= 50} onClick={() => setCount(c => c + 1)} aria-label="Flere">+</Button>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="counter-reason" className="text-lg">Årsag (skal udfyldes)</Label>
        <Textarea id="counter-reason" maxLength={500} disabled={frozen} value={reason} onChange={e => setReason(e.target.value)} className="min-h-28 text-lg" />
      </div>
      <p className="text-base text-muted-foreground">Annullering af en indløsning sker i administrationen under Stempelkort → Medlemmer.</p>
      {action.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-lg text-destructive">{action.error}</p>}
      <Button type="submit" className="h-20 text-2xl" disabled={!ready || action.pending}>{action.pending ? 'Gemmer…' : action.uncertain ? 'Prøv igen' : 'Gem korrektion'}</Button>
      <Button type="button" variant="outline" className={big} disabled={action.pending} onClick={onBack}>{action.uncertain ? 'Annullér' : 'Tilbage'}</Button>
    </form>
  );
}
