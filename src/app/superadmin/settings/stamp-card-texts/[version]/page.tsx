import { notFound } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { CURRENT_TEMPLATE, TEMPLATE_VERSIONS, TEXT_FIELD_LABELS, TEXT_FIELDS } from '@/lib/loyalty/stamp-card/texts';
import { TemplateText } from '../template-text';

export const dynamic = 'force-dynamic';

export default async function StampCardTextVersionPage({ params }: { params: Promise<{ version: string }> }) {
  await requirePlatformSuperuser();
  const { version } = await params;
  const template = TEMPLATE_VERSIONS.find(t => t.version === decodeURIComponent(version));
  if (!template) notFound();
  return (
    <div className="space-y-6">
      <Link href="/superadmin/settings/stamp-card-texts" className="text-sm text-muted-foreground hover:text-foreground">← Tilbage til versionerne</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Standardtekst {template.version}</h1>
        <p className="text-muted-foreground">Udgivet {template.publishedAt} · {template.version === CURRENT_TEMPLATE.version ? 'aktuel version' : 'tidligere version'}. {template.note}</p>
      </div>
      <section className="space-y-4 rounded-lg border bg-white p-4">
        {TEXT_FIELDS.map(field => (
          <div key={field} className="grid gap-1">
            <h2 className="text-sm font-medium">{TEXT_FIELD_LABELS[field]}</h2>
            <TemplateText text={template.texts[field]} />
          </div>
        ))}
      </section>
    </div>
  );
}
