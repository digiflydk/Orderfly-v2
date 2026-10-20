import Link from '@/components/superadmin/admin-link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TextVersionRow } from '@/lib/loyalty/stamp-card/admin';
import { formatDateTime } from '@/lib/loyalty/stamp-card/csv';
import { danishDate, TEXT_FIELD_LABELS, TEXT_FIELDS, type ProgramTexts } from '@/lib/loyalty/stamp-card/texts';

// Published text versions per brand, newest first. Each opens exactly the filled
// text customers saw while it applied.
export function TextVersions({ rows, viewHref, multiBrand }: { rows: TextVersionRow[]; viewHref: string; multiBrand: boolean }) {
  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div><h2 className="font-semibold">Tekstversioner</h2>
        <p className="text-sm text-muted-foreground">En ny version udgives, når et aktivt program gemmes med ændrede tekster eller regler, som teksterne nævner.</p></div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Der er ikke udgivet nogen tekster endnu.</p> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {multiBrand && <TableHead>Brand</TableHead>}
                <TableHead>Version</TableHead><TableHead>Gældende fra</TableHead><TableHead>Udgivet af</TableHead>
                <TableHead>Standardtekst</TableHead><TableHead className="text-right">Medlemmer tilmeldt</TableHead><TableHead><span className="sr-only">Handling</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={`${r.brandId}_${r.textVersion}`}>
                  {multiBrand && <TableCell>{r.brandName}</TableCell>}
                  <TableCell className="whitespace-nowrap">{r.textVersion} {r.current && <Badge variant="secondary" className="ml-1">Aktuel</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDateTime(r.effectiveFrom)}</TableCell>
                  <TableCell>{r.createdByName ?? 'Ukendt'}</TableCell>
                  <TableCell>{r.templateVersion ?? 'Egen tekst'}</TableCell>
                  <TableCell className="text-right">{r.members}</TableCell>
                  <TableCell><Link className="underline-offset-2 hover:underline" href={`${viewHref}&textBrand=${encodeURIComponent(r.brandId)}&textVersion=${r.textVersion}`}>Vis</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export function RenderedTexts({ texts }: { texts: ProgramTexts }) {
  return (
    <div className="grid gap-4">
      {TEXT_FIELDS.map(field => texts[field] ? (
        <div key={field} className="grid gap-1">
          <h3 className="text-sm font-medium">{TEXT_FIELD_LABELS[field]}</h3>
          <div className="whitespace-pre-line rounded-md border p-3 text-sm leading-relaxed" data-text={field}>{texts[field]}</div>
        </div>
      ) : null)}
    </div>
  );
}

type Detail = { brand: { brandName: string }; textVersion: number; effectiveFrom: number; templateVersion: string | null; createdByName: string | null;
  rendered: ProgramTexts; variants: Array<{ createdAt: number; texts: ProgramTexts }> };

export function TextVersionDetail({ detail }: { detail: Detail }) {
  return (
    <section className="space-y-4 rounded-lg border bg-white p-4">
      <div>
        <h2 className="font-semibold">{detail.brand.brandName} · version {detail.textVersion}</h2>
        <p className="text-sm text-muted-foreground">
          Gældende fra {danishDate(detail.effectiveFrom)} · udgivet af {detail.createdByName ?? 'ukendt'} · {detail.templateVersion ? `standardtekst ${detail.templateVersion}` : 'egen tekst'}
        </p>
      </div>
      <RenderedTexts texts={detail.rendered} />
      {detail.variants.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm">Brandets oplysninger blev ændret, mens versionen gjaldt. Nogle medlemmer så derfor en variant med andre oplysninger:</p>
          {detail.variants.map(v => (
            <details key={v.createdAt} className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Variant vist første gang {formatDateTime(v.createdAt)}</summary>
              <div className="mt-3"><RenderedTexts texts={v.texts} /></div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
