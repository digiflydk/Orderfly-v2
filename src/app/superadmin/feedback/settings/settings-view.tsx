'use client';
import { useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { saveFeedbackSettings, retryFeedbackMail } from './actions';
import { Input } from '@/components/ui/input';
import type { FeedbackAutomation } from '@/lib/feedback/mail-config';
type MailJob = { id: string; eventId?: string; brandId: string; kind: string; state: string; attempts: number; updatedAt: number };
const states: Record<string, string> = { pending: 'I kø', preparing: 'Forberedes', dispatching: 'Afventer svar', accepted: 'Accepteret af Mpanel', uncertain: 'Kræver kontrol', failed: 'Fejl', suppressed: 'Stoppet' };
type SettingsBrand = FeedbackAutomation & { emailConfigured: boolean; id: string; name: string; slug: string; publicReviewsEnabled: boolean };
export function FeedbackSettingsView({ brands: initialBrands, locations, questionVersions, canEdit, jobs: initialJobs = [] }: { jobs?: MailJob[]; brands: SettingsBrand[]; locations: { id: string; brandId: string; name: string; slug: string }[]; questionVersions: { id: string; name: string; language: string; orderTypes: string[] }[]; canEdit: boolean }) {
  const [brands, setBrands] = useState(initialBrands), [selected, setSelected] = useState(initialBrands[0]?.id || '');
  const [pending, setPending] = useState(false), [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [jobs, setJobs] = useState(initialJobs);
  const updateBrand = (values: Partial<SettingsBrand>) => setBrands(current => current.map(b => b.id === selected ? { ...b, ...values } : b));
  const brand = brands.find(b => b.id === selected);
  return <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-bold">Feedbackindstillinger</h1>
    <div className="space-y-3"><Label htmlFor="feedback-brand">Brand</Label><select id="feedback-brand" className="h-10 w-full rounded-md border bg-background px-3" value={selected} disabled={pending} onChange={event => { setSelected(event.target.value); setMessage(null); }}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
    {brand && <form className="space-y-5 rounded-lg border p-5" onSubmit={async event => {
      event.preventDefault(); if (pending || !canEdit) return; setPending(true); setMessage(null);
      try { setMessage(await saveFeedbackSettings({ brandId: brand.id, publicReviewsEnabled: brand.publicReviewsEnabled, emailEnabled: brand.emailEnabled, automaticRequests: brand.automaticRequests, delayHours: brand.delayHours, reminderAfterHours: brand.reminderAfterHours, maxReminders: brand.maxReminders, autoReplyEnabled: brand.autoReplyEnabled, language: brand.language, questionVersionId: brand.questionVersionId })); }
      catch { setMessage({ ok: false, message: 'Kunne ikke gemme. Dine valg er bevaret. Prøv igen.' }); }
      finally { setPending(false); }
    }}>
      <h2 className="text-lg font-semibold">Offentlige anmeldelser</h2>
      <div className="flex items-center justify-between gap-4"><Label htmlFor="publicReviewsEnabled">Vis godkendte anmeldelser på kundesiden</Label><Switch id="publicReviewsEnabled" checked={brand.publicReviewsEnabled} disabled={pending || !canEdit} onCheckedChange={value => { setBrands(current => current.map(b => b.id === brand.id ? { ...b, publicReviewsEnabled: value } : b)); setMessage(null); }} /></div>
      <p className="text-sm text-muted-foreground">Anmeldelser godkendes enkeltvis i indbakken. Interne noter og kundekontaktoplysninger vises ikke. Nye godkendelser er anonyme som standard.</p>
      <div className="space-y-4 border-t pt-5">
        <h2 className="text-lg font-semibold">E-mail til kunder</h2>
        <div className="space-y-2"><Label htmlFor="questionVersionId">Aktivt feedbackskema for brandet</Label><select id="questionVersionId" className="h-10 w-full rounded-md border bg-background px-3" value={brand.questionVersionId || ''} disabled={pending || !canEdit} onChange={event => updateBrand({ questionVersionId: event.target.value || null })}><option value="">Automatisk standard</option>{questionVersions.filter(version => version.language === brand.language).map(version => <option key={version.id} value={version.id}>{version.name} · {version.orderTypes.join(', ')}</option>)}</select><p className="text-sm text-muted-foreground">Valget gælder kun dette brand. Skemaet skal være aktivt og passe til ordretypen.</p></div>
        {!brand.emailConfigured && <p className="text-sm text-muted-foreground">Mailopsætningen for dette brand skal færdiggøres, før afsendelse kan aktiveres.</p>}
        <div className="flex items-center justify-between gap-4"><Label htmlFor="emailEnabled">Aktivér feedbackmails</Label><Switch id="emailEnabled" disabled={pending || !canEdit || (!brand.emailConfigured && !brand.emailEnabled)} checked={brand.emailEnabled} onCheckedChange={value => updateBrand({ emailEnabled: value })} /></div>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="automaticRequests">Invitér automatisk efter gennemført oplevelse</Label><Switch id="automaticRequests" disabled={pending || !canEdit} checked={brand.automaticRequests} onCheckedChange={value => updateBrand({ automaticRequests: value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="delayHours">Ventetid i timer</Label><Input id="delayHours" type="number" min={0} max={168} value={brand.delayHours} disabled={pending || !canEdit} onChange={e => updateBrand({ delayHours: Number(e.target.value) })} /></div><div><Label htmlFor="mailLanguage">Sprog</Label><select id="mailLanguage" className="h-10 w-full rounded-md border bg-background px-3" value={brand.language} disabled={pending || !canEdit} onChange={e => updateBrand({ language: e.target.value })}><option value="da">Dansk</option><option value="en">Engelsk</option></select></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="maxReminders">Påmindelser</Label><select id="maxReminders" className="h-10 w-full rounded-md border bg-background px-3" value={brand.maxReminders} disabled={pending || !canEdit} onChange={e => updateBrand({ maxReminders: Number(e.target.value) })}><option value={0}>Ingen</option><option value={1}>Højst én påmindelse</option></select></div><div><Label htmlFor="reminderAfterHours">Timer før påmindelse</Label><Input id="reminderAfterHours" type="number" min={24} max={336} value={brand.reminderAfterHours} disabled={pending || !canEdit} onChange={e => updateBrand({ reminderAfterHours: Number(e.target.value) })} /></div></div>
        <div className="flex items-center justify-between gap-4"><Label htmlFor="autoReplyEnabled">Send en tak, når kunden har svaret</Label><Switch id="autoReplyEnabled" disabled={pending || !canEdit} checked={brand.autoReplyEnabled} onCheckedChange={value => updateBrand({ autoReplyEnabled: value })} /></div>
        <p className="text-sm text-muted-foreground">Påmindelser stoppes efter et svar. Feedbackmailen er knyttet til den gennemførte oplevelse og er adskilt fra nyhedsbrev/marketing. Spørgeskema og publicerede mPanel-skabeloner skal være klar på det valgte sprog.</p>
      </div>
      <Button disabled={pending || !canEdit}>{pending ? 'Gemmer…' : 'Gem indstillinger'}</Button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? '' : 'text-destructive'}>{message.message}</p>}
      <ul className="space-y-2">{locations.filter(l => l.brandId === brand.id && l.slug && brand.slug).map(l => <li key={l.id}><a className="underline" href={`/${encodeURIComponent(brand.slug)}/${encodeURIComponent(l.slug)}/reviews`} target="_blank" rel="noreferrer">Se anmeldelser for {l.name}</a></li>)}</ul>
    </form>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Seneste afsendelser</h2><p className="text-sm text-muted-foreground">Højst 50 beskeder pr. brand. Accepteret betyder, at Mpanel har lagt beskeden i den centrale kø. Den endelige Mailtrap-status vises i Mpanel.</p>
      <div className="space-y-3">{jobs.filter(job => job.brandId === selected).map(job => <div key={job.id} className="space-y-2 rounded-lg border p-3"><p className="font-medium">{job.kind === 'invitation' ? 'Invitation' : job.kind === 'reminder' ? 'Påmindelse' : 'Tak for dit svar'} · {states[job.state] || 'Ukendt status'}</p><p className="text-sm text-muted-foreground">{job.attempts} forsøg</p>{job.eventId && <p className="break-all text-xs text-muted-foreground">Hændelses-ID: {job.eventId}</p>}
        {['failed', 'uncertain'].includes(job.state) && canEdit && <details><summary className="cursor-pointer text-sm underline">Genstart efter kontrol</summary><p className="py-2 text-sm">Kontrollér først i mPanel, at beskeden ikke er modtaget. En genstart kan ellers sende en ekstra mail.</p><Button variant="outline" disabled={pending} onClick={async () => {
          setPending(true); try { const result = await retryFeedbackMail(job.id, true); setMessage(result); if (result.ok) setJobs(current => current.map(j => j.id === job.id ? { ...j, state: 'pending' } : j)); }
          catch { setMessage({ ok: false, message: 'Kunne ikke genstarte. Prøv igen.' }); } finally { setPending(false); }
        }}>Bekræft ikke modtaget og genstart</Button></details>}
      </div>)}</div>
      {jobs.filter(job => job.brandId === selected).length === 0 && <p>Ingen afsendelser registreret.</p>}
    </section>
    <Link href="/superadmin/feedback/questions" className="inline-block underline">Administrér feedbackspørgsmål</Link>
  </div>;
}
