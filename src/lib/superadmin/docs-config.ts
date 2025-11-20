// src/lib/superadmin/docs-config.ts
export type DevDocMeta = {
  id: string;
  title: string;
  filename: string; // relative to /developer/docs
  category: 'overview' | 'api' | 'database' | 'logging';
};

export type DevUtilityMeta = {
  id: string;
  title: string;
  description: string;
  apiPath: string;  // or page path for simple links
  type: 'json-download' | 'link' | 'markdown-download';
};

export const DEV_DOCS: DevDocMeta[] = [
  {
    id: 'overview',
    title: 'System overview',
    filename: 'OVERVIEW.md',
    category: 'overview',
  },
  {
    id: 'api-map',
    title: 'API map',
    filename: 'API-MAP.md',
    category: 'api',
  },
  {
    id: 'db-structure',
    title: 'Database structure',
    filename: 'DB-STRUCTURE.md',
    category: 'database',
  },
  {
    id: 'audit-logging',
    title: 'Audit logging',
    filename: 'AUDIT-LOGGING.md',
    category: 'logging',
  },
];

export const DEV_UTILITIES: DevUtilityMeta[] = [
  {
    id: 'audit-logs',
    title: 'Audit logs UI',
    description: 'Open the superadmin audit log viewer.',
    apiPath: '/superadmin/logs',
    type: 'link',
  },
  {
    id: 'api-map-json',
    title: 'API map (JSON)',
    description: 'Download the current API overview as JSON.',
    apiPath: '/api/superadmin/docs/api-map',
    type: 'json-download',
  },
  {
    id: 'db-paths',
    title: 'DB paths (JSON)',
    description: 'List of key Firestore paths used by Orderfly.',
    apiPath: '/api/superadmin/docs/db-paths',
    type: 'json-download',
  },
  {
    id: 'db-structure',
    title: 'DB structure (JSON)',
    description: 'High level schema of collections and key fields.',
    apiPath: '/api/superadmin/docs/db-structure',
    type: 'json-download',
  },
  {
    id: 'superadmin-dump',
    title: 'Superadmin data dump',
    description: 'Compact JSON dump of brands, locations, menus, and settings.',
    apiPath: '/api/superadmin/docs/superadmin-dump',
    type: 'json-download',
  },
  {
    id: 'audit-settings',
    title: 'Audit logging settings',
    description: 'Current audit actions and logging configuration.',
    apiPath: '/api/superadmin/docs/audit-settings',
    type: 'json-download',
  },
  {
    id: 'docs-bundle',
    title: 'Download Docs Bundle',
    description: 'Download all documentation files as a single markdown file.',
    apiPath: '/api/docs/bundle',
    type: 'markdown-download',
  },
];
