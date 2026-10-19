'use client';

import { useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ProgramSettings } from '@/lib/loyalty/stamp-card/rules';
import type { ProgramTextsMeta } from '@/lib/loyalty/stamp-card/model';
import {
  BRAND_PLACEHOLDERS, checkTemplate, CONDITIONS, CURRENT_TEMPLATE, nextTextMeta, PLACEHOLDERS, previewTexts, TEMPLATE_VERSIONS, TEXT_FIELD_LABELS,
  type BrandTextSource, type Placeholder, type TextField,
} from '@/lib/loyalty/stamp-card/texts';
import { cn } from '@/lib/utils';

export type TextContextView = { brand: BrandTextSource; activeLocations: number };

const ROWS: Record<TextField, number> = { consentText: 4, consentHelp: 4, termsAccept: 2, terms: 16 };
const MAX: Record<TextField, number> = { consentText: 2000, consentHelp: 2000, termsAccept: 300, terms: 20000 };

// Unfilled placeholders stay visible as {name} in the admin preview only, marked.
function Marked({ text }: { text: string }) {
  return <>{text.split(/(\{[^{}\n]+\})/).map((part, i) => i % 2 ? <mark key={i} className="rounded bg-destructive/15 px-0.5 text-destructive">{part}</mark> : part)}</>;
}

type Props = {
  settings: ProgramSettings; texts: ProgramTextsMeta; context: TextContextView; brandId: string; canEditBrand: boolean;
  errors: Record<string, string>; onChange: (field: TextField, value: string) => void; onRestore: () => void;
};

export function ProgramTextsCard({ settings, texts, context, brandId, canEditBrand, errors, onChange, onRestore }: Props) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit'), [confirmRestore, setConfirmRestore] = useState(false);
  const [now] = useState(() => Date.now());
  const preview = previewTexts(settings, texts, context, now);
  const next = nextTextMeta(settings, texts, now);
  const brandMissing = preview.missing.filter(m => BRAND_PLACEHOLDERS.includes(m.placeholder));
  const otherMissing = preview.missing.filter(m => !BRAND_PLACEHOLDERS.includes(m.placeholder));
  const outdated = texts.templateVersion !== null && texts.templateVersion !== CURRENT_TEMPLATE.version
    && TEMPLATE_VERSIONS.some(t => t.version === texts.templateVersion);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tekster</CardTitle>
        <CardDescription>
          Samtykke og vilkår bygges af standardteksten. Pladsholdere som {'{cvr}'} udfyldes, når kunden ser teksten.
          {texts.version ? ` Udgivet version ${texts.version}.` : ' Teksten udgives, når programmet er aktivt og gemmes.'}
          {next.version !== texts.version && ` Gemmes ændringerne, bliver det version ${next.version}, gældende fra i dag.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {outdated && (
          <div role="status" className="rounded-lg border p-4 text-sm">
            <p className="font-medium">Der er en ny version af standardteksten.</p>
            <p className="text-muted-foreground">Dine tekster er ikke ændret. Vælg &quot;Gendan standardtekst&quot; for at bruge den nye version.</p>
          </div>
        )}
        {texts.version > 0 && texts.templateVersion === null && (
          <p className="text-sm text-muted-foreground">Programmet bruger sin egen tekst, ikke en uændret standardtekst.</p>
        )}
        {preview.missing.length > 0 && (
          <div role="alert" className="rounded-lg border border-destructive/50 p-4 text-sm">
            <p className="font-medium text-destructive">Programmet kan ikke aktiveres, før disse oplysninger er udfyldt:</p>
            <ul className="mt-2 list-disc pl-5">
              {brandMissing.map(m => <li key={m.placeholder}>{PLACEHOLDERS[m.placeholder]} mangler under Brands.</li>)}
              {otherMissing.map(m => <li key={m.placeholder}>{PLACEHOLDERS[m.placeholder]}</li>)}
            </ul>
            {brandMissing.length > 0 && (canEditBrand
              ? <Link href={`/superadmin/brands/edit/${brandId}`} className="mt-2 inline-block underline underline-offset-4">Ret brandets oplysninger</Link>
              : <p className="mt-2 text-muted-foreground">Kontakt en platformsadministrator for at få brandets oplysninger udfyldt.</p>)}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Tekster" className="flex gap-1 border-b">
            {([['edit', 'Rediger'], ['preview', 'Forhåndsvisning']] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {label}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => setConfirmRestore(true)}>Gendan standardtekst</Button>
        </div>

        {tab === 'edit' ? (
          <>
            {(Object.keys(TEXT_FIELD_LABELS) as TextField[]).map(field => {
              const problem = checkTemplate(settings[field]);
              return (
                <div key={field} className="grid gap-1.5">
                  <Label htmlFor={field}>{TEXT_FIELD_LABELS[field]}</Label>
                  <Textarea id={field} rows={ROWS[field]} maxLength={MAX[field]} value={settings[field]} onChange={e => onChange(field, e.target.value)}
                    aria-invalid={!!(errors[field] || problem)} className={field === 'terms' ? 'font-mono text-xs' : undefined} />
                  {field === 'consentText' && <p className="text-xs text-muted-foreground">Skal nævne kanalen (e-mail), hvad nyhedsbrevet indeholder, og at kunden altid kan afmelde sig.</p>}
                  {field === 'termsAccept' && <p className="text-xs text-muted-foreground">Ordet &quot;vilkårene&quot; bliver et link til vilkårene.</p>}
                  {(errors[field] || problem) && <p role="alert" className="text-sm text-destructive">{errors[field] ?? problem}</p>}
                </div>
              );
            })}
            <details className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Pladsholdere og betingede afsnit</summary>
              <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                {(Object.keys(PLACEHOLDERS) as Placeholder[]).map(name => <li key={name}><code>{`{${name}}`}</code> – {PLACEHOLDERS[name]}</li>)}
              </ul>
              <ul className="mt-3 grid gap-1">
                {(Object.keys(CONDITIONS) as Array<keyof typeof CONDITIONS>).map(name => (
                  <li key={name}><code>{`{#hvis ${name}}…{/hvis}`}</code> eller <code>{`{#hvis ikke ${name}}…{/hvis}`}</code> – {CONDITIONS[name]}</li>
                ))}
              </ul>
              <p className="mt-3 text-muted-foreground">Et betinget afsnit skal starte og slutte på samme linje.</p>
            </details>
          </>
        ) : (
          <div data-testid="texts-preview" className="grid gap-4 rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Sådan ser kunden teksterne ved tilmelding og på siden Vilkår.</p>
            <div className="flex items-start gap-3 rounded-xl border p-4">
              <span aria-hidden className="mt-1 h-5 w-5 shrink-0 rounded border" />
              <div className="grid gap-2">
                <p className="whitespace-pre-line leading-relaxed" data-preview="consentText"><Marked text={preview.texts.consentText} /></p>
                {preview.texts.consentHelp && <p className="whitespace-pre-line text-sm text-muted-foreground" data-preview="consentHelp"><Marked text={preview.texts.consentHelp} /></p>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-1 h-5 w-5 shrink-0 rounded border" />
              <p className="leading-relaxed" data-preview="termsAccept"><Marked text={preview.texts.termsAccept} /></p>
            </div>
            <article className="grid gap-2 border-t pt-4">
              <h3 className="text-lg font-semibold">Vilkår for {settings.name}</h3>
              <div className="whitespace-pre-line text-sm leading-relaxed" data-preview="terms"><Marked text={preview.texts.terms} /></div>
            </article>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gendan standardtekst?</AlertDialogTitle>
            <AlertDialogDescription>
              De fire tekster erstattes af standardteksten ({CURRENT_TEMPLATE.version}). Dine egne ændringer i teksterne går tabt. Intet gemmes, før du trykker &quot;Gem indstillinger&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onRestore(); setConfirmRestore(false); }}>Gendan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
