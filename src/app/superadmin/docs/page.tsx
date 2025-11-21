
// src/app/superadmin/docs/page.tsx
import React from 'react';
import Link from 'next/link';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import DocsCard from '@/components/superadmin/docs/DocsCard';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import DocsMarkdown from '@/components/superadmin/docs/DocsMarkdown';

export default async function SuperadminDocsPage({
  searchParams,
}: {
  searchParams?: { doc?: string };
}) {
  await requireSuperadmin();

  // Default to overview if no doc is specified
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
          <h1 className="text-2xl font-semibold mb-2">{activeDocMeta.title}</h1>
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
                  <Link href={util.apiPath} className="text-sm underline"
                    target={util.type.includes('download') ? '_blank' : undefined}
                    rel={util.type.includes('download') ? 'noreferrer' : undefined}
                  >
                    {util.type === 'link' ? 'Open' : 'Download'}
                  </Link>
                }
              />
            ))}
          </div>
        </section>
      </div>
    </DocsLayout>
  );
}
