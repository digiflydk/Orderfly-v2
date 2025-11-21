# 522-03 — Brand Website Config & Design System API (CMS)

## Goal

Implement the CMS-side API layer for Brand Website **config** under:

```text
/brands/{brandId}/website/config
```

No UI. No public API. No changes to other modules.

## Data model

Use existing TypeScript type (or create if missing):

```ts
export interface BrandWebsiteConfig {
  active: boolean;
  template: string;
  domains: string[];
  defaultLocationId: string | null;
  designSystem: Record<string, any>;
  seo: Record<string, any>;
  social: Record<string, any>;
  tracking: Record<string, any>;
  legal: Record<string, any>;
  updatedAt: any;
}
```

Config must be stored exactly in this shape in Firestore.

## Firestore path

All config reads/writes go to:

```text
/brands/{brandId}/website/config
```

Do not create new collections or subcollections in this task.

## Server actions / API functions

Create a server-side module for Brand Website config actions (e.g. `src/lib/superadmin/brand-website/config-actions.ts`), exporting:

* `getBrandWebsiteConfig(brandId: string): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteConfig(brandId: string, input: SaveBrandWebsiteConfigInput): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteDesignSystem(brandId: string, input: DesignSystemInput): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteSeo(brandId: string, input: SeoInput): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteSocial(brandId: string, input: SocialInput): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteTracking(brandId: string, input: TrackingInput): Promise<BrandWebsiteConfig>`
* `saveBrandWebsiteLegal(brandId: string, input: LegalInput): Promise<BrandWebsiteConfig>`

Names must match exactly.

## Validation (Zod)

Add schemas, e.g. in `config-schemas.ts`:

* `brandWebsiteConfigBaseSchema` (active, template, domains, defaultLocationId)
* `brandWebsiteDesignSystemSchema`
* `brandWebsiteSeoSchema`
* `brandWebsiteSocialSchema`
* `brandWebsiteTrackingSchema`
* `brandWebsiteLegalSchema`

Types:

* `SaveBrandWebsiteConfigInput`
* `DesignSystemInput`
* `SeoInput`
* `SocialInput`
* `TrackingInput`
* `LegalInput`

All save functions must validate input with the corresponding schema and reject invalid data.

## Behaviour

* `getBrandWebsiteConfig`:

  * If document exists: return full config, defaulting missing objects (designSystem, seo, social, tracking, legal) to `{}`.
  * If it does not exist: return a virtual config:

    ```ts
    {
      active: false,
      template: 'template-1',
      domains: [],
      defaultLocationId: null,
      designSystem: {},
      seo: {},
      social: {},
      tracking: {},
      legal: {},
      updatedAt: null,
    }
    ```

* `saveBrandWebsiteConfig`:

  * Validate base fields.
  * Merge onto existing config, preserving sub-objects.
  * Set `updatedAt` to server timestamp.

* `saveBrandWebsiteDesignSystem` / `Seo` / `Social` / `Tracking` / `Legal`:

  * Validate partial input with respective schema.
  * Merge into corresponding sub-object.
  * Preserve other sub-objects.
  * Set `updatedAt` to server timestamp.

## Auth

* Only Superadmin (or existing superadmin CMS auth helper).
* Non-superadmin must not be able to call these actions.

## Version

Footer version must be updated to:

```text
v1.0.263 • 522-03
```

## Non-goals

* No UI changes.
* No public Brand Website API.
* No changes outside brand website config module and version constant.
