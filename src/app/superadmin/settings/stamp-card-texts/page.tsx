import Link from '@/components/superadmin/admin-link';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { templateUsage } from '@/lib/loyalty/stamp-card/admin';
import { CURRENT_TEMPLATE, TEMPLATE_VERSIONS } from '@/lib/loyalty/stamp-card/texts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The standard texts are versioned in code (src/lib/loyalty/stamp-card/texts.ts);
// a change is a new version through review. This page lists them read-only.
export default async function StampCardTextsPage() {
  await requirePlatformSuperuser();
  const usage = await templateUsage(getAdminDb());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stempelkort-tekster</h1>
        <p className="text-muted-foreground">Standardteksterne for samtykke og vilkår. Brands får en kopi af den aktuelle version, når de opretter et stempelkort, og beholder den, til de selv vælger &quot;Gendan standardtekst&quot;.</p>
      </div>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead><TableHead>Udgivet</TableHead><TableHead>Ændring</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Brands, der bruger den</TableHead><TableHead><span className="sr-only">Handling</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...TEMPLATE_VERSIONS].reverse().map(t => (
                <TableRow key={t.version}>
                  <TableCell className="whitespace-nowrap font-medium">{t.version}</TableCell>
                  <TableCell className="whitespace-nowrap">{t.publishedAt}</TableCell>
                  <TableCell className="min-w-64">{t.note}</TableCell>
                  <TableCell>{t.version === CURRENT_TEMPLATE.version ? <Badge>Aktuel</Badge> : <Badge variant="secondary">Tidligere</Badge>}</TableCell>
                  <TableCell className="text-right">{usage[t.version] ?? 0}</TableCell>
                  <TableCell><Link className="underline-offset-2 hover:underline" href={`/superadmin/settings/stamp-card-texts/${encodeURIComponent(t.version)}`}>Vis</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">Brands, der har ændret teksten, tæller ikke med. Antallet viser programmer, hvis tekster er en uændret kopi af versionen.</p>
      </section>
    </div>
  );
}
