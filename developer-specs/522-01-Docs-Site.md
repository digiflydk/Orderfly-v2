# 522-01 — Brand Website Developer Docs Hub

## Goal

Create the Brand Website Module docs hub page under Superadmin:

- Route: `/superadmin/docs/brand-website-module`
- Purpose: central place for tools, dumps and documentation related to the Brand Website Module.

## Requirements

The page must:

- Be accessible only to Superadmin.
- Use the existing DocsLayout / DocsNav system.
- Provide **cards/sections** for:
  1. Tools & Views
  2. Data Dumps & Logging
  3. Developer Docs

Each card should:

- Have a clear title
- Have a short description
- Have one or more actions (buttons/links)

## Links

Tools & Views:

- Audit Logs (filtered by module): `/superadmin/logs/audit?module=brand-website`
- API Map (filtered by module): `/superadmin/api-map?module=brand-website`
- CMS Snapshots: `/superadmin/cms-snapshots?module=brand-website`
- URLs overview: `/superadmin/urls?module=brand-website`

Data Dumps & Logging:

- CMS Dump (later tasks): `/api/developer/dumps/brand-website/cms`
- CMS API Dump (later tasks): `/api/developer/dumps/brand-website/cms-api`
- DB Structure Dump: `/api/developer/dumps/brand-website/db-structure`
- DB Paths Dump: `/api/developer/dumps/brand-website/db-paths`
- Logging Settings: `/superadmin/logging?module=brand-website`
- Per-Action Toggles: `/superadmin/logging?module=brand-website#actions`

Developer Docs:

- Link into the main docs viewer with group filter:
  - `/superadmin/docs?group=brand-website`

## Non-goals

- No actual DB or API logic is implemented here.
- No public website UI implemented here.
