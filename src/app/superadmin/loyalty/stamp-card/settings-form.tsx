'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelect } from '@/components/ui/multi-select';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ProgramSettings } from '@/lib/loyalty/stamp-card/rules';
import type { ProgramTextsMeta } from '@/lib/loyalty/stamp-card/model';
import { CURRENT_TEMPLATE, textKey } from '@/lib/loyalty/stamp-card/texts';
import { saveProgramSettings } from './actions';
import { ProgramTextsCard, type TextContextView } from './program-texts-card';

type Option = { id: string; name: string };
type Initial = { brand: { brandId: string; brandName: string }; version: number; settings: ProgramSettings; updatedAt: number | null;
  updatedByName: string | null; products: Option[]; categories: Option[]; texts: ProgramTextsMeta; textContext: TextContextView };

const ERRORS: Record<string, string> = {
  record_changed: 'Indstillingerne er ændret af en anden. Genindlæs siden og prøv igen.',
  invalid_reward_reference: 'Et valgt produkt eller en kategori findes ikke længere for brandet.',
  forbidden: 'Du har ikke adgang til at ændre indstillingerne for dette brand.',
  invalid_settings: 'Kontrollér de markerede felter.',
  texts_incomplete: 'Teksterne mangler oplysninger. Se listen under Tekster.',
};
const kr = (ore: number) => (ore / 100).toString().replace('.', ',');
const ore = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
const int = (value: string) => (value.trim() === '' ? NaN : Number(value));

export function SettingsForm({ initial, canEditBrand }: { initial: Initial; canEditBrand: boolean }) {
  const router = useRouter(), { toast } = useToast(), [pending, start] = useTransition();
  const [s, setS] = useState<ProgramSettings>(initial.settings);
  const [minimum, setMinimum] = useState(kr(initial.settings.minimumAmountOre));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warn, setWarn] = useState<ProgramSettings | null>(null);
  const set = <K extends keyof ProgramSettings>(key: K, value: ProgramSettings[K]) => setS(prev => ({ ...prev, [key]: value }));
  const reward = s.reward ?? { type: 'free_product' as const, productIds: [], categoryIds: [] };
  const toggle = <T extends string>(list: T[], value: T, on: boolean) => on ? [...new Set([...list, value])] : list.filter(v => v !== value);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // A free product with nothing chosen is no reward yet; an inactive draft may save without one.
    const empty = s.reward?.type === 'free_product' && s.reward.productIds.length + s.reward.categoryIds.length === 0;
    const settings = { ...s, reward: empty ? null : s.reward, minimumAmountOre: ore(minimum) };
    // Changing the terms of an active program needs notice to the members (terms §10). A program
    // active since before text versions has no published key; its saved settings are what members saw.
    const published = initial.texts.key ?? textKey(initial.settings);
    if (initial.settings.active && settings.active && textKey(settings) !== published) { setWarn(settings); return; }
    save(settings);
  }

  function save(settings: ProgramSettings) {
    setWarn(null);
    start(async () => {
      const result = await saveProgramSettings({ brandId: initial.brand.brandId, version: initial.version, settings });
      if (result.ok) {
        setErrors({});
        toast({ title: result.data?.changed ? 'Indstillingerne er gemt' : 'Ingen ændringer', description: result.data?.changed ? 'De gælder for nye stempler og kort.' : undefined });
        router.refresh();
      } else {
        setErrors(result.fields ?? {});
        toast({ variant: 'destructive', title: 'Indstillingerne blev ikke gemt',
          description: result.missing?.length ? `Mangler: ${result.missing.map(m => m.label).join(', ')}`.replace(/([^.])$/, '$1.') : ERRORS[result.error] ?? 'Prøv igen.' });
      }
    });
  }

  const field = (key: string) => errors[key] ? <p role="alert" className="text-sm text-destructive">{errors[key]}</p> : null;
  const number = (key: keyof ProgramSettings, label: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} type="number" inputMode="numeric" min={1} value={Number.isNaN(s[key] as number) ? '' : String(s[key] ?? '')}
        onChange={e => set(key, int(e.target.value) as never)} aria-invalid={!!errors[key]} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}{field(key)}
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{initial.brand.brandName}</CardTitle>
          <CardDescription>
            {initial.updatedAt ? `Version ${initial.version} · sidst ændret ${new Date(initial.updatedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })} af ${initial.updatedByName ?? 'ukendt'}` : 'Programmet er endnu ikke gemt.'}
            {' '}Ændringer gælder fremadrettet. Stempler og belønninger, der allerede er givet, beholder deres regler.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4 md:col-span-2">
            <div><Label htmlFor="active">Program aktivt</Label><p className="text-sm text-muted-foreground">Når programmet er slået fra, kan der hverken gives stempler eller indløses.</p></div>
            <Switch id="active" checked={s.active} onCheckedChange={v => set('active', v)} />
          </div>
          <div className="grid gap-1.5"><Label htmlFor="name">Programnavn</Label><Input id="name" value={s.name} maxLength={80} onChange={e => set('name', e.target.value)} />{field('name')}</div>
          {number('stampsRequired', 'Stempler til belønning')}
          <div className="grid gap-1.5">
            <Label htmlFor="minimum">Minimumsbeløb pr. køb (kr.)</Label>
            <Input id="minimum" inputMode="decimal" value={minimum} onChange={e => setMinimum(e.target.value)} aria-invalid={!!errors.minimumAmountOre} />
            <p className="text-xs text-muted-foreground">Betalt beløb inkl. moms efter rabat.</p>{field('minimumAmountOre')}
          </div>
          {number('stampsPerPurchase', 'Stempler pr. kvalificerende køb')}
          {number('cardValidityMonths', 'Kortets gyldighed ved inaktivitet (måneder)', 'Hvert nyt stempel nulstiller fristen.')}
          {number('rewardValidityMonths', 'Belønningens gyldighed (måneder)', 'Fra optjening til belønningen skal være brugt.')}
          {number('sessionDays', 'Kundens login-session (dage)')}
          {number('minimumAge', 'Aldersgrænse (år)', 'Står i vilkårene som kravet for at blive medlem.')}
          {number('counterIdleMinutes', 'Kassevisning: log ud efter inaktivitet (minutter)', 'Fra 1 til 60 minutter. Tabletten låses, og næste medarbejder logger ind med sin PIN.')}
          <div className="grid gap-1.5">
            <Label htmlFor="maxStampsPerDay">Maks. stempler pr. medlem pr. dag</Label>
            <Input id="maxStampsPerDay" type="number" min={1} placeholder="Ingen grænse" value={s.maxStampsPerDay ?? ''}
              onChange={e => set('maxStampsPerDay', e.target.value === '' ? null : int(e.target.value))} />{field('maxStampsPerDay')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Belønning</CardTitle></CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <AdminSelectField label="Belønningstype" value={reward.type} onChange={e => {
            const type = e.target.value;
            set('reward', type === 'fixed_amount' ? { type, amountOre: 5000 } : type === 'percentage' ? { type, percent: 10 } : { type: 'free_product', productIds: [], categoryIds: [] });
          }}>
            <option value="free_product">Gratis produkt</option>
            <option value="fixed_amount">Fast rabat i kr.</option>
            <option value="percentage">Procentrabat</option>
          </AdminSelectField>
          {reward.type === 'free_product' && (
            <>
              <div className="grid gap-1.5"><span className="text-sm font-medium">Produkter</span>
                <MultiSelect options={initial.products.map(p => ({ value: p.id, label: p.name }))} selected={reward.productIds}
                  onChange={productIds => set('reward', { ...reward, productIds })} placeholder="Vælg produkter" /></div>
              <div className="grid gap-1.5"><span className="text-sm font-medium">eller kategorier</span>
                <MultiSelect options={initial.categories.map(c => ({ value: c.id, label: c.name }))} selected={reward.categoryIds}
                  onChange={categoryIds => set('reward', { ...reward, categoryIds })} placeholder="Vælg kategorier" /></div>
            </>
          )}
          {reward.type === 'fixed_amount' && (
            <div className="grid gap-1.5"><Label htmlFor="amount">Rabat (kr.)</Label>
              <Input id="amount" inputMode="decimal" value={kr(reward.amountOre)} onChange={e => set('reward', { type: 'fixed_amount', amountOre: ore(e.target.value) })} /></div>
          )}
          {reward.type === 'percentage' && (
            <div className="grid gap-1.5"><Label htmlFor="percent">Rabat (%)</Label>
              <Input id="percent" type="number" min={1} max={100} value={reward.percent} onChange={e => set('reward', { type: 'percentage', percent: int(e.target.value) })} /></div>
          )}
          {field('reward')}
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="rewardDescription">Beskrivelse af belønning</Label>
            <Input id="rewardDescription" maxLength={200} placeholder="Fx Gratis pizza" value={s.rewardDescription} onChange={e => set('rewardDescription', e.target.value)} />
            <p className="text-xs text-muted-foreground">Vises for kunden og ved kassen.</p>{field('rewardDescription')}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Regler</CardTitle></CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div><Label htmlFor="crossLocation">Gælder på tværs af afdelinger</Label><p className="text-sm text-muted-foreground">Ellers gælder kortet kun i afdelingen for første stempel.</p></div>
            <Switch id="crossLocation" checked={s.crossLocation} onCheckedChange={v => set('crossLocation', v)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div><Label htmlFor="discounted">Rabat- og kampagneordrer giver stempel</Label></div>
            <Switch id="discounted" checked={s.discountedOrdersQualify} onCheckedChange={v => set('discountedOrdersQualify', v)} />
          </div>
          <fieldset className="grid gap-2 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Kanaler ved kassen</legend>
            {([['dine_in', 'Dine-in'], ['takeaway', 'Takeaway']] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm"><Checkbox checked={s.counterChannels.includes(value)}
                onCheckedChange={v => set('counterChannels', toggle(s.counterChannels, value, v === true))} />{label}</label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Orderfly-ordrer</legend>
            {([['pickup', 'Afhentning'], ['delivery', 'Levering']] as const).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm"><Checkbox checked={s.orderTypes.includes(value)}
                onCheckedChange={v => set('orderTypes', toggle(s.orderTypes, value, v === true))} />{label}</label>
            ))}
            <p className="text-xs text-muted-foreground">Automatiske stempler fra Orderfly-ordrer aktiveres senere. Wolt, Uber Eats og andre tredjepartskanaler giver aldrig stempler.</p>
          </fieldset>
          {field('counterChannels')}
        </CardContent>
      </Card>

      <ProgramTextsCard settings={{ ...s, minimumAmountOre: ore(minimum) }} texts={initial.texts} context={initial.textContext} brandId={initial.brand.brandId}
        canEditBrand={canEditBrand} errors={errors} onChange={(field, value) => set(field, value)}
        onRestore={() => setS(prev => ({ ...prev, ...CURRENT_TEMPLATE.texts }))} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gem indstillinger</Button>
      </div>

      <AlertDialog open={!!warn} onOpenChange={open => { if (!open) setWarn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vilkårene ændres for et aktivt program</AlertDialogTitle>
            <AlertDialogDescription>
              Væsentlige ændringer af vilkårene kræver 30 dages varsel til medlemmerne (vilkårenes afsnit 10). Nye medlemmer ser den nye tekst med det samme, og den bliver version {initial.texts.version + 1}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={() => warn && save(warn)}>Gem ændringerne</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
