// src/app/superadmin/docs/brand-website-module/layout.tsx

import DocsLayout from "@/components/superadmin/docs/DocsLayout";
import DocsNav from "@/components/superadmin/docs/DocsNav";
import type { DevDocMeta, DevUtilityMeta } from "@/lib/superadmin/docs-config";

const BRAND_WEBSITE_DOCS: DevDocMeta[] = [
    {
        id: 'brand-website-module',
        title: 'Overview',
        filename: 'BRAND-WEBSITE-OVERVIEW.md',
        category: 'overview',
        href: '/superadmin/docs/brand-website-module',
    },
    {
        id: 'brand-website-backlog',
        title: 'Backlog',
        filename: 'placeholder.md', // Not used, but required by type
        category: 'overview',
        href: '/superadmin/docs/brand-website-module/backlog',
    },
    {
        id: 'brand-website-architecture',
        title: 'Architecture',
        filename: 'BRAND-WEBSITE-ARCHITECTURE.md',
        category: 'overview',
    },
    {
        id: 'api-map',
        title: 'API Map',
        filename: 'BRAND-WEBSITE-API-MAP.md',
        category: 'api',
        href: '/superadmin/docs/api-map?module=brand-website',
    },
    {
        id: 'brand-website-db-structure',
        title: 'DB Structure',
        filename: 'BRAND-WEBSITE-DB-STRUCTURE.md',
        category: 'database',
    },
    {
        id: 'brand-website-db-paths',
        title: 'DB Paths',
        filename: 'BRAND-WEBSITE-DB-PATHS.md',
        category: 'database',
    },
    {
        id: 'brand-website-logging',
        title: 'Logging & Audit',
        filename: 'BRAND-WEBSITE-LOGGING.md',
        category: 'logging',
    },
    {
        id: 'brand-website-qa',
        title: 'QA Strategy',
        filename: 'BRAND-WEBSITE-QA-STRATEGY.md',
        category: 'overview',
    },
    {
        id: 'brand-website-troubleshooting',
        title: 'Troubleshooting',
        filename: 'BRAND-WEBSITE-TROUBLESHOOTING.md',
        category: 'overview',
    },
];

const BRAND_WEBSITE_UTILITIES: DevUtilityMeta[] = [
    {
        id: 'cms-dump',
        title: 'Full CMS Dump',
        description: 'Download JSON dump of all Brand Website CMS documents.',
        apiPath: '/api/developer/dumps/brand-website/cms',
        type: 'json-download',
    },
     {
        id: 'cms-api-dump',
        title: 'CMS API Dump',
        description: 'List of all CMS-facing endpoints for the module.',
        apiPath: '/api/developer/dumps/brand-website/cms-api',
        type: 'json-download',
    },
    {
        id: 'db-structure-dump',
        title: 'DB Structure Dump',
        description: 'Overview of Firestore collections and subcollections used by the module.',
        apiPath: '/api/developer/dumps/brand-website/db-structure',
        type: 'json-download',
    },
    {
        id: 'db-paths-dump',
        title: 'DB Paths Dump',
        description: 'List of Firestore paths where Brand Website Module data is stored or read.',
        apiPath: '/api/developer/dumps/brand-website/db-paths',
        type: 'json-download',
    }
];


export default function BrandWebsiteModuleLayout({ children }: { children: React.ReactNode }) {
    return (
        <DocsLayout
            sidebar={<DocsNav docs={BRAND_WEBSITE_DOCS} utilities={BRAND_WEBSITE_UTILITIES} activeDocId={''} />}
        >
            {children}
        </DocsLayout>
    );
}