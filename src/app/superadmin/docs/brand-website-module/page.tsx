
// src/app/superadmin/docs/brand-website-module/page.tsx
import React from 'react';
import { notFound } from 'next/navigation';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsMarkdown from '@/components/superadmin/docs/DocsMarkdown';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import { requireSuperadmin } from '@/lib/auth/superadmin';

export default async function BrandWebsiteModuleDocPage() {
  await requireSuperadmin();

  const activeDocId = 'brand-website-module'; // Hardcoded for this page
  const activeDocMeta = DEV_DOCS.find((d) => d.id === activeDocId);

  if (!activeDocMeta) {
    notFound();
  }

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
            A single source of truth for the multi-brand website engine.
          </p>
        </section>

        <section className="border rounded-lg p-4 bg-card">
          <DocsMarkdown filename={activeDocMeta.filename} />
        </section>
      </div>
    </DocsLayout>
  );
}
