
// src/app/superadmin/docs/api-map/page.tsx
'use server';

import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveSearchParams } from '@/lib/next/resolve-props';
import { notFound } from 'next/navigation';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import { apiMapsByModule } from '@/lib/docs/api-maps';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code2, Database } from 'lucide-react';
import type { ApiMapArea } from '@/lib/docs/api-map-types';

function ApiArea({ area }: { area: ApiMapArea }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <h4 className="font-semibold text-sm">{area.label}</h4>
            {area.notes && <p className="text-xs text-muted-foreground mt-1">{area.notes}</p>}
            <div className="mt-3 space-y-2">
                <div>
                    <h5 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5"><Code2 className="h-3 w-3"/> Actions</h5>
                    <div className="flex flex-wrap gap-1">
                        {area.actions.map(action => (
                            <Badge key={action} variant="secondary" className="font-mono text-xs">{action}</Badge>
                        ))}
                    </div>
                </div>
                 <div>
                    <h5 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5"><Database className="h-3 w-3"/> Firestore Paths</h5>
                    <div className="flex flex-wrap gap-1">
                        {area.firestorePaths.map(path => (
                            <Badge key={path} variant="outline" className="font-mono text-xs">{path}</Badge>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default async function ApiMapPage({ searchParams }: AsyncPageProps<{}, { module?: string }>) {
    const query = await resolveSearchParams(searchParams);
    const moduleKey = query?.module || 'brand-website';
    const config = apiMapsByModule[moduleKey];

    if (!config) {
        notFound();
    }

    return (
        <DocsLayout
            sidebar={<DocsNav docs={DEV_DOCS} utilities={DEV_UTILITIES} activeDocId="api-map" />}
        >
            <div className="space-y-8">
                <section>
                    <h1 className="text-2xl font-semibold mb-2">API Map: {config.label}</h1>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                </section>

                {config.cms && (
                    <section className="space-y-4">
                        <h2 className="text-xl font-semibold">CMS API</h2>
                        <div className="grid gap-4 md:grid-cols-2">
                            {config.cms.areas.map(area => <ApiArea key={area.id} area={area} />)}
                        </div>
                    </section>
                )}

                {config.public && (
                    <section className="space-y-4">
                        <h2 className="text-xl font-semibold">Public API</h2>
                         <div className="grid gap-4 md:grid-cols-2">
                            {config.public.areas.map(area => <ApiArea key={area.id} area={area} />)}
                        </div>
                    </section>
                )}
                
                {config.domainResolver && (
                     <section className="space-y-4">
                        <h2 className="text-xl font-semibold">Domain Resolver</h2>
                        <ApiArea area={{...config.domainResolver, id: 'domain-resolver'}} />
                    </section>
                )}

                {config.logging && (
                    <section className="space-y-4">
                        <h2 className="text-xl font-semibold">Logging</h2>
                         <div className="grid gap-4 md:grid-cols-2">
                            {config.logging.audit && <ApiArea area={{...config.logging.audit, id: 'audit-log', actions: [], firestorePaths: [config.logging.audit.firestorePath]}} />}
                            {config.logging.api && <ApiArea area={{...config.logging.api, id: 'api-log', actions: [], firestorePaths: [config.logging.api.firestorePath]}} />}
                        </div>
                    </section>
                )}
            </div>
        </DocsLayout>
    );
}
