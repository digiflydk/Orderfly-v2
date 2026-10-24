'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DiscountCardAdminData, DiscountCardGroup, DiscountCardAssignment } from '@/lib/loyalty/discount-card/types';
import { saveDiscountCardFeatureAction, saveDiscountCardGroupAction, saveDiscountCardAssignmentAction, inviteDiscountCardAction, searchDiscountCardCustomersAction } from './actions';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const errors: Record<string, string> = {
  record_changed: 'Oplysningerne er ændret af en anden. Genindlæs siden før du prøver igen.',
  forbidden: 'Kun platformens superadmin kan administrere rabatkort.',
  unauthorized: 'Log ind igen for at fortsætte.',
  invalid_settings: 'Kontrollér felterne og prøv igen.', invalid_input: 'Kontrollér felterne og prøv igen.',
  mail_configuration_required: 'Mailafsendelse er ikke sat op for dette brand.',
  feature_inactive: 'Aktivér rabatkort for brandet før du sender invitationen.',
  group_inactive: 'Gruppen er ikke aktiv.', customer_not_found: 'Kunden findes ikke hos dette brand.',
};
const localDate = (value: number | null) => value === null ? '' : new Date(value - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const timestamp = (value: string) => value ? new Date(value).getTime() : null;
const statusLabel = { active: 'Aktivt', blocked: 'Spærret', pending: 'Afventer aktivering' };

export function DiscountCardAdmin({ brandId, brandName, initial }: { brandId: string; brandName: string; initial: DiscountCardAdminData }) {
  const [data, setData] = useState(initial), [feature, setFeature] = useState(initial.feature);
  const [pending, start] = useTransition(), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [groupId, setGroupId] = useState(''), [groupVersion, setGroupVersion] = useState(0), [groupName, setGroupName] = useState(''), [percentage, setPercentage] = useState(''), [groupActive, setGroupActive] = useState(true);
  const [customerId, setCustomerId] = useState(''), [assignmentVersion, setAssignmentVersion] = useState(0), [cardGroup, setCardGroup] = useState(''), [blocked, setBlocked] = useState(false);
  const [startsAt, setStartsAt] = useState(''), [expiresAt, setExpiresAt] = useState(''), [search, setSearch] = useState(''), [searchQuery, setSearchQuery] = useState('');
  const [inviteName, setInviteName] = useState(''), [inviteEmail, setInviteEmail] = useState(''), [inviteGroup, setInviteGroup] = useState('');
  const customer = data.customers.find(row => row.id === customerId), assignment = data.assignments.find(row => row.customerId === customerId);
  function operation(fn: () => Promise<{ ok: true; data: DiscountCardAdminData } | { ok: false; error: string }>, success: string) {
    setError(''); setMessage('');
    start(async () => {
      try {
        const result = await fn();
        if (!result.ok) { setError(errors[result.error] || 'Handlingen kunne ikke gennemføres. Genindlæs siden og prøv igen.'); return; }
        setData(result.data); setFeature(result.data.feature); setMessage(success);
      } catch { setError('Handlingen kunne ikke gennemføres. Genindlæs siden og prøv igen.'); }
    });
  }
  function editGroup(row?: DiscountCardGroup) {
    setGroupId(row?.id || ''); setGroupVersion(row?.version ?? 0); setGroupName(row?.name || ''); setPercentage(row ? String(row.percentage) : ''); setGroupActive(row?.active ?? true); setMessage(''); setError('');
  }
  function selectCustomer(id: string) {
    const card = data.assignments.find(row => row.customerId === id);
    setCustomerId(id); setAssignmentVersion(card?.version ?? 0); setCardGroup(card?.groupId || ''); setBlocked(card?.status === 'blocked'); setStartsAt(localDate(card?.startsAt ?? null)); setExpiresAt(localDate(card?.expiresAt ?? null)); setMessage(''); setError('');
  }
  function editCard(card: DiscountCardAssignment) {
    if (!data.customers.some(row => row.id === card.customerId)) { setError('Find kunden via e-mailfeltet før du redigerer kortet.'); return; }
    selectCustomer(card.customerId);
  }
  return <div className="space-y-6" aria-busy={pending}>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
    <Card><CardHeader><CardTitle>Aktivering · {brandName}</CardTitle></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        if (feature.locationScope.mode === 'selected' && !feature.locationScope.locationIds.length) { setError('Vælg mindst én lokation.'); setMessage(''); return; }
        operation(() => saveDiscountCardFeatureAction({ brandId, version: feature.version, enabled: feature.enabled, locationScope: feature.locationScope }, searchQuery), 'Indstillingerne er gemt.');
      }}>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="dc-enabled">Aktivér rabatkort</Label><Switch id="dc-enabled" checked={feature.enabled} disabled={pending} onCheckedChange={enabled => setFeature(row => ({ ...row, enabled }))} /></div>
        <div className="space-y-2"><Label htmlFor="dc-scope">Gælder på</Label><select id="dc-scope" className={selectClass} disabled={pending} value={feature.locationScope.mode} onChange={event => setFeature(row => ({ ...row, locationScope: { mode: event.target.value as 'all' | 'selected', locationIds: [] } }))}><option value="all">Alle brandets lokationer</option><option value="selected">Udvalgte lokationer</option></select></div>
        {feature.locationScope.mode === 'all' ? <p className="text-sm text-muted-foreground">Gælder også fremtidige lokationer hos {brandName}. Andre brands er ikke omfattet.</p> : <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Lokationer</legend>{data.locations.map(row => <label key={row.id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={pending} checked={feature.locationScope.locationIds.includes(row.id)} onChange={event => setFeature(current => ({ ...current, locationScope: { mode: 'selected', locationIds: event.target.checked ? [...current.locationScope.locationIds, row.id] : current.locationScope.locationIds.filter(id => id !== row.id) } }))} />{row.name}</label>)}{!data.locations.length && <p className="text-sm">Brandet har ingen tilgængelige lokationer.</p>}</fieldset>}
        <Button disabled={pending} type="submit">{pending ? 'Arbejder…' : 'Gem indstillinger'}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Rabatgrupper</CardTitle></CardHeader><CardContent className="space-y-5">
      <ul className="space-y-2" aria-label="Rabatgrupper">{data.groups.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><span className="min-w-0 break-words text-sm">{row.name} · {row.percentage} % · {row.active ? 'Aktiv' : 'Inaktiv'}</span><Button type="button" variant="outline" disabled={pending} aria-label={`Rediger gruppe ${row.name}`} onClick={() => editGroup(row)}>Rediger</Button></li>)}</ul>
      {!data.groups.length && <p className="text-sm text-muted-foreground">Der er ingen rabatgrupper endnu.</p>}
      <form className="space-y-4" noValidate onSubmit={event => {
        event.preventDefault(); const rate = Number(percentage);
        if (!groupName.trim() || groupName.trim().length > 80 || !Number.isFinite(rate) || rate <= 0 || rate > 100) { setError('Angiv et gruppenavn og en rabat større end 0 og højst 100 %.'); setMessage(''); return; }
        const id = groupId || crypto.randomUUID();
        operation(async () => { const result = await saveDiscountCardGroupAction({ brandId, id, version: groupVersion, name: groupName.trim(), percentage: rate, active: groupActive }, searchQuery); if (result.ok) { setGroupId(id); setGroupVersion(result.savedVersion); } return result; }, 'Rabatgruppen er gemt.');
      }}>
        <h3 className="font-medium">{groupId ? 'Rediger rabatgruppe' : 'Ny rabatgruppe'}</h3>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dc-group-name">Gruppenavn</Label><Input id="dc-group-name" maxLength={80} value={groupName} disabled={pending} onChange={event => setGroupName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="dc-percentage">Rabat i procent</Label><Input id="dc-percentage" type="number" min="0.01" max="100" step="0.01" value={percentage} disabled={pending} onChange={event => setPercentage(event.target.value)} /></div></div>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="dc-group-active">Gruppen er aktiv</Label><Switch id="dc-group-active" checked={groupActive} disabled={pending} onCheckedChange={setGroupActive} /></div>
        <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">Gem gruppe</Button>{groupId && <Button variant="outline" disabled={pending} type="button" onClick={() => editGroup()}>Ny gruppe</Button>}</div>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Personlige kort</CardTitle></CardHeader><CardContent className="space-y-5">
      <form className="space-y-4 rounded-md border p-4" onSubmit={event => {
        event.preventDefault();
        if (!inviteName.trim() || !inviteGroup) { setError('Angiv navn, e-mail og rabatgruppe.'); setMessage(''); return; }
        operation(() => inviteDiscountCardAction({ brandId, name: inviteName.trim(), email: inviteEmail.trim(), groupId: inviteGroup, startsAt: null, expiresAt: null }, searchQuery), 'Invitationen er lagt i kø. Kortet aktiveres først, når modtageren accepterer.');
      }}>
        <h3 className="font-medium">Invitér en ny person</h3><p className="text-sm text-muted-foreground">Modtageren behøver ikke være kunde i forvejen. Invitationen tilmelder ikke personen til nyhedsbreve.</p>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dc-invite-name">Modtagerens navn</Label><Input id="dc-invite-name" required maxLength={100} value={inviteName} disabled={pending} onChange={event => setInviteName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="dc-invite-email">Modtagerens e-mail</Label><Input id="dc-invite-email" type="email" required maxLength={254} value={inviteEmail} disabled={pending} onChange={event => setInviteEmail(event.target.value)} /></div></div>
        <div className="space-y-2"><Label htmlFor="dc-invite-group">Invitationsgruppe</Label><select id="dc-invite-group" required className={selectClass} disabled={pending} value={inviteGroup} onChange={event => setInviteGroup(event.target.value)}><option value="">Vælg gruppe</option>{data.groups.filter(row => row.active).map(row => <option key={row.id} value={row.id}>{row.name} · {row.percentage} %</option>)}</select></div>
        <Button type="submit" disabled={pending || !data.feature.enabled}>Send ny invitation</Button>
        {!data.feature.enabled && <p className="text-sm text-muted-foreground">Aktivér rabatkort for at sende invitationer.</p>}
      </form>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={event => { event.preventDefault(); operation(async () => { const result = await searchDiscountCardCustomersAction(brandId, search); if (result.ok) { setSearchQuery(search.trim()); setCustomerId(''); } return result; }, 'Kundelisten er opdateret.'); }}><div className="flex-1 space-y-2"><Label htmlFor="dc-search">Find kunde på præcis e-mailadresse</Label><Input id="dc-search" type="email" value={search} disabled={pending} onChange={event => setSearch(event.target.value)} /></div><Button type="submit" variant="outline" disabled={pending}>Find kunde</Button></form>
      {data.customersTruncated && <p className="text-sm text-muted-foreground">Kun de første kunder vises. Søg på præcis e-mail for at finde en anden kunde.</p>}
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); const start = timestamp(startsAt), end = timestamp(expiresAt);
        if (!customer || !cardGroup || (start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) || (start !== null && end !== null && end <= start)) { setError('Vælg kunde og gruppe. Sluttidspunktet skal ligge efter starttidspunktet.'); setMessage(''); return; }
        operation(async () => { const result = await saveDiscountCardAssignmentAction({ brandId, customerId, memberId: customer.memberId, groupId: cardGroup, version: assignmentVersion, status: blocked ? 'blocked' : customer.memberId ? 'active' : 'pending', startsAt: start, expiresAt: end }, searchQuery); if (result.ok) setAssignmentVersion(result.savedVersion); return result; }, 'Kortet er gemt.');
      }}>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dc-customer">Kunde</Label><select id="dc-customer" className={selectClass} disabled={pending} value={customerId} onChange={event => selectCustomer(event.target.value)}><option value="">Vælg kunde</option>{data.customers.map(row => <option key={row.id} value={row.id}>{row.name || row.email} · {row.email}</option>)}</select></div><div className="space-y-2"><Label htmlFor="dc-card-group">Kortets gruppe</Label><select id="dc-card-group" className={selectClass} disabled={pending} value={cardGroup} onChange={event => setCardGroup(event.target.value)}><option value="">Vælg gruppe</option>{data.groups.map(row => <option key={row.id} value={row.id}>{row.name} · {row.percentage} %{!row.active ? ' (inaktiv)' : ''}</option>)}</select></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="dc-start">Gælder fra (valgfrit)</Label><Input id="dc-start" type="datetime-local" value={startsAt} disabled={pending} onChange={event => setStartsAt(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="dc-end">Udløber (valgfrit)</Label><Input id="dc-end" type="datetime-local" value={expiresAt} disabled={pending} onChange={event => setExpiresAt(event.target.value)} /></div></div>
        <p className="text-sm text-muted-foreground">Tidspunkter vises i din enheds tidszone. Uden udløb gælder kortet, indtil det deaktiveres. Tidligere stempler og belønninger bevares.</p>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="dc-blocked">Spær kortet</Label><Switch id="dc-blocked" checked={blocked} disabled={pending} onCheckedChange={setBlocked} /></div>
        {customer && !customer.memberId && <p className="text-sm text-muted-foreground">Kunden skal aktivere kortet via invitationen, før det kan bruges.</p>}
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending || !customerId}>Gem kort</Button><Button type="button" variant="outline" disabled={pending || !assignment || assignment.status === 'blocked' || !data.feature.enabled || !data.groups.find(row => row.id === assignment.groupId)?.active} onClick={() => assignment && operation(() => inviteDiscountCardAction({ brandId, customerId: assignment.customerId, expectedVersion: assignment.version }, searchQuery), 'Invitationen er lagt i kø. Levering er ikke bekræftet endnu.')}>Send invitation</Button></div>
      </form>
      <ul aria-label="Udstedte kort" className="space-y-2">{data.assignments.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><span className="min-w-0 break-words text-sm">{data.customers.find(item => item.id === row.customerId)?.name || data.customers.find(item => item.id === row.customerId)?.email || 'Kunde'} · {data.groups.find(item => item.id === row.groupId)?.name || 'Gruppe'} · {statusLabel[row.status]}</span><Button type="button" variant="outline" disabled={pending} aria-label={`Rediger kort ${row.customerId}`} onClick={() => editCard(row)}>Rediger</Button></li>)}</ul>
      {data.assignmentsTruncated && <p className="text-sm text-muted-foreground">Kortlisten er begrænset. Søg på kundens præcise e-mailadresse for at redigere et andet kort.</p>}
    </CardContent></Card>
  </div>;
}
