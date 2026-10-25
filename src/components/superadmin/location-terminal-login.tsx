'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { brandSlugError, brandSubdomainUrl } from '@/lib/brand-subdomain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type LoginSettings = { configured: boolean; enabled: boolean; username: string; revision: number; canEdit: boolean };
function settings(value: unknown): LoginSettings | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return typeof row.configured === 'boolean' && typeof row.enabled === 'boolean' && typeof row.username === 'string'
    && typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 0 && typeof row.canEdit === 'boolean'
    ? { configured: row.configured, enabled: row.enabled, username: row.username, revision: row.revision, canEdit: row.canEdit } : null;
}
function failureMessage(status: number) {
  if (status === 401) return 'Din session er udløbet. Log ind igen, og åbn indstillingerne på ny.';
  if (status === 403) return 'Du har ikke adgang til at administrere terminal-login for denne restaurant.';
  if (status === 409) return 'Indstillingerne er ændret, eller brugernavnet er optaget. Hent den aktuelle status, og prøv igen.';
  if (status === 400) return 'Kontrollér brugernavn og adgangskode. Brugernavnet skal være 3–64 tegn, og en ny adgangskode skal være 12–128 tegn.';
  return 'Ændringen kunne ikke bekræftes. Hent den aktuelle status, før du forsøger igen.';
}
/** Deliberately outside LocationFormPage's form/recovery provider. Secrets exist only in this component's memory. */
export function LocationTerminalLogin({ locationId, locationName, brandSlug }: { locationId: string; locationName: string; brandSlug?: string }) {
  const merchantAppHref = brandSlug && !brandSlugError(brandSlug) ? `${brandSubdomainUrl(brandSlug)}/mapp` : '/mapp';
  const endpoint = `/api/superadmin/locations/${encodeURIComponent(locationId)}/terminal-login`;
  const [saved, setSaved] = useState<LoginSettings | null>(null);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [enabled, setEnabled] = useState(true), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [mustRefresh, setMustRefresh] = useState(false), [confirmDisable, setConfirmDisable] = useState(false);
  const lock = useRef(false), generation = useRef(0), readController = useRef<AbortController | null>(null), writeController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (lock.current) return;
    const current = ++generation.current;
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setLoading(true); setPassword(''); setConfirmDisable(false); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
      if (current !== generation.current) return;
      if (!response.ok) { setSaved(null); throw new Error(failureMessage(response.status)); }
      const result = settings(await response.json());
      if (!result) throw new Error('Terminalindstillingerne kunne ikke læses. Prøv at hente status igen.');
      if (current !== generation.current) return;
      setSaved(result); setUsername(result.username); setEnabled(result.configured ? result.enabled : true); setMustRefresh(false);
    } catch (failure) {
      if (current === generation.current) { setSaved(null); setMustRefresh(true); setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Forbindelsen tog for lang tid. Hent status igen.'); }
    } finally { clearTimeout(timeout); if (current === generation.current) setLoading(false); }
  }, [endpoint]);
  useEffect(() => {
    lock.current = false; setBusy(false);
    setSaved(null); setUsername(''); setPassword(''); setMustRefresh(false);
    void load();
    return () => { ++generation.current; readController.current?.abort(); writeController.current?.abort(); writeController.current = null; };
  }, [load]);
  async function save(disable = false) {
    if (!saved?.canEdit || lock.current || loading || mustRefresh) return;
    const normalized = username.trim().toLowerCase();
    if (!disable && (!/^[a-z0-9._-]{3,64}$/.test(normalized) || (!saved.configured && !password) || (password && (password.length < 12 || password.length > 128)))) {
      setError('Brug et brugernavn på 3–64 tegn (a–z, 0–9, punktum, bindestreg eller underscore) og en adgangskode på 12–128 tegn.'); return;
    }
    const command = { username: disable ? saved.username : normalized, enabled: disable ? false : enabled, expectedRevision: saved.revision,
      ...(!disable && password ? { password } : {}) };
    const current = ++generation.current;
    readController.current?.abort(); lock.current = true; setBusy(true); setError(''); setNotice(''); setPassword('');
    const controller = new AbortController(); writeController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(endpoint, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: controller.signal });
      if (current !== generation.current) return;
      if (!response.ok) {
        if ([401, 403].includes(response.status)) setSaved(null);
        setMustRefresh(true); throw new Error(failureMessage(response.status));
      }
      const result = settings(await response.json());
      if (!result) { setMustRefresh(true); throw new Error('Resultatet kunne ikke bekræftes. Hent den aktuelle status før næste ændring.'); }
      if (current !== generation.current) return;
      setSaved(result); setUsername(result.username); setEnabled(result.enabled); setConfirmDisable(false);
      setNotice(result.enabled ? 'Terminal-login er gemt. Tidligere terminalsessioner er logget ud.' : 'Terminal-login er deaktiveret. Tidligere terminalsessioner er logget ud.');
    } catch (failure) {
      if (current === generation.current) { setMustRefresh(true); setError(failure instanceof Error && failure.name !== 'AbortError' ? failure.message : 'Resultatet kunne ikke bekræftes. Hent status før næste ændring.'); }
    } finally {
      clearTimeout(timeout); if (writeController.current === controller) { writeController.current = null; lock.current = false; }
      if (current === generation.current) { setBusy(false); setPassword(''); }
      // Do not retain the submitted secret for retry or recovery.
      if ('password' in command) command.password = '';
    }
  }
  const blocked = busy || loading || mustRefresh || !saved?.canEdit;
  return <Card className="mt-6" aria-label="Terminal-login"><CardHeader><CardTitle>Terminal-login</CardTitle><CardDescription>Separat login til ordreterminalen for {locationName}. Indstillingerne gemmes særskilt fra restaurantens øvrige oplysninger.</CardDescription></CardHeader><CardContent className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">Status: <span>{loading ? 'Henter…' : !saved ? 'Ikke tilgængelig' : !saved.configured ? 'Ikke konfigureret' : saved.enabled ? 'Aktivt' : 'Deaktiveret'}</span></p><a href={merchantAppHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium underline">Åbn Merchant app</a></div>
    <p className="text-sm text-muted-foreground">Login giver kun adgang til denne restaurants ordrer. Terminalen forbliver logget ind, indtil der logges ud, eller adgangen ændres eller deaktiveres. Browserens lagring skal være tilgængelig.</p>
    {error && <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"><p>{error}</p><Button type="button" variant="outline" onClick={() => void load()} disabled={busy || loading}>Hent aktuel status</Button>{error.includes('Log ind') && <a className="ml-3 underline" href={`/admin-login?next=${encodeURIComponent(`/superadmin/locations/edit/${locationId}`)}`}>Log ind igen</a>}</div>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">{notice}</p>}
    {saved && !saved.canEdit && <p className="text-sm">Du har læseadgang. En bruger med redigeringsadgang til restauranten kan ændre terminal-login.</p>}
    {saved && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`terminal-username-${locationId}`}>Brugernavn til terminal</Label><Input id={`terminal-username-${locationId}`} value={username} onChange={event => setUsername(event.target.value)} disabled={blocked} minLength={3} maxLength={64} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" /><p className="text-xs text-muted-foreground">3–64 tegn. Brug bogstaver a–z, tal, punktum, bindestreg eller underscore.</p></div>
      <div className="space-y-2"><Label htmlFor={`terminal-password-${locationId}`}>Ny adgangskode</Label><Input id={`terminal-password-${locationId}`} type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={blocked} minLength={12} maxLength={128} autoComplete="new-password" aria-describedby={`terminal-password-help-${locationId}`} /><p id={`terminal-password-help-${locationId}`} className="text-xs text-muted-foreground">{saved.configured ? 'Lad feltet være tomt for at beholde adgangskoden. Skriv en ny for at nulstille den.' : 'Vælg en adgangskode på 12–128 tegn.'} Den gemte adgangskode kan ikke vises.</p></div></div>}
    {saved?.canEdit && <><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={blocked} className="h-5 w-5" />Aktivér terminal-login</label><p className="text-sm text-muted-foreground">Når du gemmer eller deaktiverer, logges eksisterende terminalsessioner ud. En ny adgangskode skal indtastes igen efter et mislykket forsøg.</p><div className="flex flex-wrap gap-3"><Button type="button" onClick={() => void save()} disabled={blocked}>{busy ? 'Gemmer…' : saved.configured ? 'Gem terminal-login' : 'Opret terminal-login'}</Button>{saved.configured && saved.enabled && <Button type="button" variant="outline" onClick={() => setConfirmDisable(true)} disabled={blocked}>Deaktivér terminal-login</Button>}</div>
      {confirmDisable && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-medium">Deaktivér login og log alle restaurantens terminaler ud?</p><div className="flex flex-wrap gap-2"><Button type="button" variant="destructive" disabled={blocked} onClick={() => void save(true)}>Bekræft deaktivering</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDisable(false)}>Fortryd</Button></div></div>}</>}
  </CardContent></Card>;
}
