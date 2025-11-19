// src/app/superadmin/docs/page.tsx
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import DocsMarkdown from '@/components/superadmin/docs/DocsMarkdown';
import DocsCard from '@/components/superadmin/docs/DocsCard';
import Link from 'next/link';
import { requireSuperadmin } from '@/lib/auth/superadmin';

export default async function SuperadminDocsPage({
  searchParams,
}: {
  searchParams?: { doc?: string };
}) {
  await requireSuperadmin();

  const activeDocId = searchParams?.doc ?? 'overview';
  const activeDocMeta = DEV_DOCS.find((d) => d.id === activeDocId) ?? DEV_DOCS[0];

  return (
    <DocsLayout
      sidebar={
        <DocsNav
          docs={DEV_DOCS}
          utilities={DEV_UTILITIES}
          activeDocId={activeDocMeta.id}
        />
      }
    >
      <div className="space-y-6">
        <section>
          <h1 className="text-2xl font-semibold mb-2">Developer docs</h1>
          <p className="text-sm text-muted-foreground">
            Central place for Orderfly developer documentation, diagnostics and dumps.
          </p>
        </section>

        <section className="border rounded-lg p-4 bg-card">
          <DocsMarkdown filename={activeDocMeta.filename} />
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Utilities</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {DEV_UTILITIES.map((util) => (
              <DocsCard
                key={util.id}
                title={util.title}
                description={util.description}
                action={
                  util.type === 'link' ? (
                    <Link href={util.apiPath} className="text-sm underline">
                      Open
                    </Link>
                  ) : (
                    <a
                      href={util.apiPath}
                      className="text-sm underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download JSON
                    </a>
                  )
                }
              />
            ))}
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}
