# Authoritative receipt print snapshots

`src/lib/printing/receipt-print-content.ts` reads server-owned receipt display facts for the shared SVG/raster renderer. It is an internal data adapter, not user or device authorization. Manual requests authorize the actor before calling it and recheck the order fingerprint and printer/credential revisions before committing the frozen result. Automatic originals retain their existing native manifest, catalog hash, target lines and eligibility checks.

## Scope and data

- Each read-only native transaction checks the requested order, brand, location and printer relationship. Printer configuration must be active Star CloudPRNT with a supported paper width; configured paper width overrides the layout preference.
- Settings records must have the expected brand ID and valid schema/revision. Missing settings use the existing central defaults.
- Only named display fields survive the bounded order projection. Provider tokens, sessions and unrelated stored customer attributes are not passed to the renderer.
- Kitchen content uses saved order products and selections. Current catalog reads enrich category headings only. The shared label-scope helper requires native product brand ownership and explicit category membership in the authorized location; category `brandId` may be absent or a stale former primary brand and is not authority. Automatic rendering accepts canonical `line-N` target IDs; duplicate/out-of-range IDs fail instead of adding or dropping food.
- Explicit manual kitchen copies may include saved menu choices and cancelled-order warnings. This does not change the automatic original catalog projector's existing combination restriction.
- Customer receipts use immutable invoice lines, seller details and totals when an invoice exists. Without an invoice, required saved monetary facts must exist; missing amounts are never invented. The current brand logo is resolved by the bounded raster asset resolver.
- Logo retrieval and rasterization happen after the manual read transaction. Automatic kitchen rasterization has no external assets or network reads.
- Text/array limits and malformed-source checks fail the print request rather than silently truncating selections or printing incomplete fiscal information. Existing automatic kitchen instruction limit remains 400 code units.

## Local verification

`node --test tests/unit/receipt-print-content.cjs tests/unit/printing-ordinary-native.cjs` covers scoped native projection, exact selected lines, malformed/foreign records, settings/actual paper width, menu quantities, cancelled warnings, immutable fiscal facts, and no invented amounts. It also exercises the complete original CloudPRNT lifecycle with the shared raster, including concurrent downloads, commit rollback, strict acknowledgements and terminal replay protection. `npm run typecheck` must pass before release.
