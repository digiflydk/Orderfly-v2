# EPIC 522 — Brand Website Module (Orderfly)

## Purpose

The Brand Website Module provides a **fully separated marketing website layer** per brand, without impacting Orderflow.

Key goals:
- Multi-brand, multi-domain website engine
- Configurable via Superadmin CMS
- Template-based (Template 1 in V1)
- Brand-level design system (colors, fonts, spacing, header, buttons)
- Dynamic content (home, pages, menu page, footer CTA)
- SEO, social, tracking, legal
- Stricter logging/audit and developer docs

Orderflow must not break if Brand Website fails.

---

## High-level Architecture

- **CMS (Superadmin UI)**  
  → uses CMS server actions / APIs  
  → writes to Firestore

- **Firestore**  
  - `/brands/{brandId}/website/config`
  - `/brands/{brandId}/website/home`
  - `/brands/{brandId}/website/pages/{slug}`
  - `/brands/{brandId}/website/menuSettings`
  - Reuses `/brands/{brandId}/locations/{locationId}` for address/hours/etc.

- **Public Website API (read-only)**  
  → later tasks (522-07)

- **Public Website Frontend**  
  → Next.js pages that render brand website based on domain

- **Logging & docs**  
  - Audit logs for all writes  
  - Developer docs hub page: `/superadmin/docs/brand-website-module`  
  - Tools: DB dumps, API map, logging settings, etc.

---

## Firestore Structure (core)

Under each brand:

- `/brands/{brandId}/website/config`  
  Global website config (active, template, domains, designSystem, seo, social, tracking, legal, updatedAt)

- `/brands/{brandId}/website/home`  
  Home page content (hero, promoTiles, campaignBanner, menuPreview, footerCta, updatedAt)

- `/brands/{brandId}/website/pages/{slug}`  
  Custom pages (about, catering, etc.)

- `/brands/{brandId}/website/menuSettings`  
  Menu page layout settings

---

## Public API (later in EPIC)

Read-only endpoints (not implemented yet in early tasks):

- `resolveBrandByDomain(domain)`
- `getPublicBrandWebsiteConfig(brandId)`
- `getPublicBrandWebsiteHome(brandId)`
- `getPublicBrandWebsitePages(brandId)`
- `getPublicBrandWebsitePageBySlug(brandId, slug)`
- `getPublicBrandWebsiteMenuSettings(brandId)`
- `getPublicBrandMenuData(brandId, locationId)`
- `getPublicBrandLocationData(brandId, locationId)`

---

## Logging & Docs (high level)

- All writes in Brand Website Module should eventually log to audit logs with `module: "brand-website"`.
- Developer docs hub page: `/superadmin/docs/brand-website-module`.
- Tools on docs hub:
  - Audit logs view (filtered by module)
  - API map (filtered by module)
  - CMS snapshots
  - URLs overview
  - DB Structure Dump
  - DB Paths Dump
  - CMS dumps (later)
  - Logging settings per module

---

## Tasks overview

- 522-01 — Documentation Site Setup
- 522-02 — DB Structure + DB Dumps (structure & paths)
- 522-02-FIN — Dev Docs registration + footer-version
- 522-03 — Config & Design System API (CMS)
- 522-04 — Homepage API (CMS)
- 522-05 — Pages API (CMS)
- 522-06 — Menu Settings API (CMS)
- 522-07 — Public Website API
- 522-08 — Audit logging integration (Brand Website)
- 522-09 — API logging integration (Brand Website)
- 522-10 — CMS UI pages for Brand Website
- 522-11 — Template 1 implementation (rendering engine)
- 522-12 — Acceptance tests

See individual task specs in separate files.
