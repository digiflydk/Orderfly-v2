# System administration cleanup (#229)

## Scope and retained behavior

System contains Cookies and Settings. Settings retains the administrator logo, Stripe payment gateway, languages and a link to cookie text administration. Brand tracking remains configured on each brand and consent continues to control optional tracking. No Firestore records or payment credentials are migrated or deleted by this release.

Removed: the developer Documentation UI, dedicated documentation exports, unused platform Analytics action/form/read, inactive favicon/browser-heading fields and duplicate Settings/cookie forms. Repository documentation under `docs/` and `developer/docs/` remains available. The checked-in favicon and route metadata continue to define the favicon and page titles. Logo writes merge only the logo field, preserving legacy stored fields.

Old `/superadmin/docs` URLs require platform superuser authorization and redirect to Settings. Dedicated `/api/superadmin/docs/*` exports and `/api/docs/list`, `/download`, `/bundle` authorize then return 410 without exporting data. The separate public Swagger `/api/docs` endpoint, debug snapshot infrastructure and audit logging remain unchanged.

## Cookie text schema and data flow

`cookie_texts/{id}` stores `consent_version`, `language`, optional `brand_id`, `shared_scope`, banner/modal strings, category strings and `last_updated`. No brand means global fallback. Read and write actions now independently require platform superuser authorization. Saving global scope explicitly removes a previously stored brand ID using a Firestore field-delete transform. Other fields are merged.

Administration edits Necessary, Functional, Statistics and Marketing, matching the storefront controls. The legacy Analytics category mirrors Statistics on save; stored legacy Performance fields are retained but have no editor. Blank Statistics fields first fall back to the corresponding legacy Analytics fields, then translated defaults. Supported language selection remains sourced from `platform_settings/languages`; feedback also uses it.

Server validation requires nonblank display fields, a valid language/identifier, an existing brand when scoped, and the active `APP_VERSION` from `src/lib/cookie-texts.ts`. Regional language codes such as `da-DK` and `en-US` are accepted. Scope/language/version collisions are rejected within the same Firestore transaction as the write; the existing record must be edited instead. The form saves to that shared version and reports failed saves. Existing consent records and the version constant are unchanged; no forced re-consent is introduced.

The public API selects brand-specific text before global text for the requested locale or its base language and active version, matching locale codes case-insensitively. Defaults are consistently Danish or English (other browser languages use English). Brand reads query only the requested brand and then select the active version and exact/base locale. Global fallback queries `global_locale_key` for exact/base locale and never scans brand records. Global saves set this normalized key; moving to brand scope deletes it. Saved custom text is preserved. Successful edits invalidate the storefront cache. Consent persistence, browser identity binding and tracking permissions are unchanged.

## Validation and release

Unit tests exercise forbidden reads/writes before IO, global scope transitions, brand validation, rejected versions/fields, save failure feedback, localized defaults, retired export authorization and old page redirects. Actual browser tests cover Settings and cookie editing at desktop/mobile widths; existing admin shell and consent regression tests remain required. Run typecheck and production build. CI, independent exact-head review and PO acceptance precede merge; deployment and read-only live verification are separate steps.

## Mandatory pre-release backfill

Do not merge or deploy this version until existing global text records have been indexed. In a trusted operator environment with the existing Firebase service account, run:

```sh
node scripts/backfill-global-cookie-index.cjs --project orderfly-39325
node scripts/backfill-global-cookie-index.cjs --project orderfly-39325 --apply
node scripts/backfill-global-cookie-index.cjs --project orderfly-39325
```

The first and last commands are read-only previews. Review the proposed record IDs and require the final preview to report zero pending updates. The script only adds `global_locale_key` to records without a brand, never changes text/version/language/consent data and rechecks scope in a transaction before each update. Invalid languages fail the preview; a concurrently changed record aborts apply and requires another preview. Existing live code ignores this new metadata, so the backfill is compatible before merge. No service credentials belong in git or chat. This migration has not been executed from the development workspace, which has no Firebase Admin credentials.
