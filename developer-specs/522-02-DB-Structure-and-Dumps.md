# 522-02 — Brand Website DB Structure + DB Dumps

## Goal

Implement:

1. Firestore structure contract for Brand Website Module.
2. Developer dump endpoints for DB structure and DB paths.
3. Wire the DB dumps into the Brand Website docs hub page.

## Firestore Structure (logical)

Under each brand:

- `/brands/{brandId}/website/config`
- `/brands/{brandId}/website/home`
- `/brands/{brandId}/website/pages/{slug}`
- `/brands/{brandId}/website/menuSettings`

These paths must be the only Brand Website DB documents for this EPIC (later tasks can add fields, but not change paths).

## Dump endpoints

Two **read-only** endpoints:

1. `GET /api/developer/dumps/brand-website/db-structure`

Must return JSON:

```json
{
  "module": "brand-website",
  "collections": {
    "brands/{brandId}/website": {
      "config": {
        "type": "document",
        "description": "Brand website global configuration (design, SEO, social, tracking, legal)"
      },
      "home": {
        "type": "document",
        "description": "Homepage content for the brand website"
      },
      "pages/{slug}": {
        "type": "document",
        "description": "Custom pages for the brand website (about, catering, etc.)"
      },
      "menuSettings": {
        "type": "document",
        "description": "Configuration for the public menu page layout"
      }
    }
  }
}
```

Headers:

* `Content-Type: application/json; charset=utf-8`
* `Content-Disposition: attachment; filename="db-structure-dump.json"`

2. `GET /api/developer/dumps/brand-website/db-paths`

Must return JSON:

```json
{
  "module": "brand-website",
  "paths": [
    "/brands/{brandId}/website",
    "/brands/{brandId}/website/config",
    "/brands/{brandId}/website/home",
    "/brands/{brandId}/website/pages",
    "/brands/{brandId}/website/pages/{slug}",
    "/brands/{brandId}/website/menuSettings"
  ]
}
```

Headers:

* `Content-Type: application/json; charset=utf-8`
* `Content-Disposition: attachment; filename="db-paths-dump.json"`

## Auth

* Both endpoints must be **Superadmin-only**.
* Use existing auth helper used for other developer tools.
* Non-superadmin must get 403.

## Docs Hub integration

On `/superadmin/docs/brand-website-module`:

* “DB Structure Dump” card/button must link to `/api/developer/dumps/brand-website/db-structure`.
* “DB Paths Dump” card/button must link to `/api/developer/dumps/brand-website/db-paths`.

## Non-goals

* Do not write any actual data.
* Do not modify other modules.
* No public API changes.
