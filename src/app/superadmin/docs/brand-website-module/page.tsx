
import { requireSuperadmin } from '@/lib/auth/superadmin';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import DocsCard from '@/components/superadmin/docs/DocsCard';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import Link from 'next/link';

const MODULE_KEY = "brand-website";

const TOOLS_AND_VIEWS = [
    {
        title: "Audit Logs",
        description: "View audit entries related to the Brand Website Module, including read and save actions.",
        href: `/superadmin/logs/audit?module=${MODULE_KEY}`,
        cta: "View Logs",
    },
    {
        title: "API Map",
        description: "Structured overview of all CMS and public APIs used by the Brand Website Module.",
        href: `/superadmin/api-map?module=${MODULE_KEY}`,
        cta: "View API Map",
    },
    {
        title: "CMS Snapshots",
        description: "Download JSON snapshots of Brand Website CMS documents for debugging.",
        href: `/superadmin/cms-snapshots?module=${MODULE_KEY}`,
        cta: "View Snapshots",
    },
    {
        title: "All URLs",
        description: "List of all Brand Website URLs used in the app and their purpose.",
        href: `/superadmin/urls?module=${MODULE_KEY}`,
        cta: "View All URLs",
    },
];

const DATA_DUMPS_LOGGING = [
    {
        title: "Full CMS Dump",
        description: "JSON dump of all Brand Website CMS documents (config, home, pages, menuSettings).",
        href: `/api/developer/dumps/brand-website/cms`,
        cta: "Download cms-dump.json",
        isDownload: true,
    },
    {
        title: "CMS API Dump",
        description: "List of all CMS-facing endpoints related to the Brand Website Module.",
        href: `/api/developer/dumps/brand-website/cms-api`,
        cta: "Download cms-api-dump.json",
        isDownload: true,
    },
    {
        title: "DB Structure Dump",
        description: "Overview of Firestore collections and subcollections used by the module.",
        href: `/api/developer/dumps/brand-website/db-structure`,
        cta: "Download db-structure-dump.json",
        isDownload: true,
    },
    {
        title: "DB Paths Dump",
        description: "List of Firestore paths where Brand Website Module data is stored or read.",
        href: `/api/developer/dumps/brand-website/db-paths`,
        cta: "Download db-paths-dump.json",
        isDownload: true,
    },
    {
        title: "Logging Settings",
        description: "Configure global and per-action audit logging for Brand Website operations.",
        href: `/superadmin/logging?module=${MODULE_KEY}`,
        cta: "View Logging Settings",
    },
    {
        title: "Per-Action Toggles",
        description: "Enable or disable logging for individual Brand Website actions.",
        href: `/superadmin/logging?module=${MODULE_KEY}#actions`,
        cta: "Configure Actions",
    },
];

const DEVELOPER_DOCS = [
    {
        title: "Developer — Docs",
        description: "Markdown documentation for the Brand Website Module, stored in the /docs directory.",
        href: `/superadmin/docs?group=${MODULE_KEY}`,
        cta: "View Docs",
    }
]

function Section({ title, items }: { title: string, items: any[] }) {
    return (
        <section className="space-y-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {items.map(item => (
                    <DocsCard
                        key={item.title}
                        title={item.title}
                        description={item.description}
                        action={
                            <Link 
                                href={item.href} 
                                className="text-sm underline"
                                target={item.isDownload ? '_blank' : undefined}
                                rel={item.isDownload ? 'noreferrer' : undefined}
                            >
                                {item.cta}
                            </Link>
                        }
                    />
                ))}
            </div>
        </section>
    );
}


export default async function BrandWebsiteModuleHubPage() {
    await requireSuperadmin();

    return (
        <DocsLayout
            sidebar={<DocsNav docs={DEV_DOCS} utilities={DEV_UTILITIES} activeDocId="brand-website-module" />}
        >
            <div className="space-y-8">
                <section>
                    <h1 className="text-2xl font-semibold mb-2">Brand Website Module</h1>
                    <p className="text-sm text-muted-foreground">
                        Developer tools and documentation for the Brand Website Module.
                    </p>
                </section>
                
                <Section title="Tools & Views" items={TOOLS_AND_VIEWS} />
                <Section title="Data Dumps & Logging" items={DATA_DUMPS_LOGGING} />
                <Section title="Developer Docs" items={DEVELOPER_DOCS} />
            </div>
        </DocsLayout>
    );
}
