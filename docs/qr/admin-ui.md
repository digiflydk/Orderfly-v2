# QR administration component (candidate, issue #394)

`src/app/superadmin/qr-codes/qr-manager.tsx` exports `QrManager`, its draft/summary types and the injected `QrManagerApi`. It is a client component, not an authenticated route. No API implementation, server authorization, Firestore rules, navigation, deployment or live verification is included in this slice. Coordination: #389.

## Contract

Props are `brands`, `initialCodes`, `capabilities` and `api`. A brand choice contains its ID, display name and permitted locations. Summaries are supplied only after the server has checked current brand/location access. Client capability flags control presentation only. Every server action must independently authorize the stored brand/location, action permission and current session.

A `QrDraft` contains `name`, `brandId`, nullable `locationId`, `kind` (`dynamic` or `static`), `destination`, `staticType`, structured `fields`, `campaign`, `tags` and `utm` (`source`, `medium`, `campaign`, `content`, `term`). Optional `expiresAt` is epoch milliseconds or null. The current date input explicitly uses the start of the selected UTC date. Optional `style` contains width, opaque dark/light colors, error correction level and quiet-zone margin. Default rendering is 512 pixels, black on white, level M, margin 4. Server rendering remains authoritative for contrast, size, payload and scannability.

A stored summary adds `id`, string `revision`, `status` (`active`, `paused`, `archived`) and optional `publicUrl`. The component strips record metadata before sending a draft. Adapters may translate their native revision representation to a string.

API callbacks return promises:

- `save(draft, {id?, revision?, requestId})` returns the saved summary. Only dynamic drafts can be saved. Creating uses no ID or revision. Editing sends the stored ID and listed revision. The brand and code kind cannot change during editing.
- `setStatus(id, status, {revision, requestId})` returns the authoritative saved summary. Archive requires an explicit confirmation; pause/activate applies only to dynamic codes. There is no hard-delete action.
- `preview(draft, {id?, revision?})` returns `{imageUrl, payload}`. Dynamic preview requires an unchanged saved record and must render its permanent short URL, never the destination directly.
- `download(draft, 'png'|'svg', {id?, revision?})` returns `{url, filename}`. Dynamic export has the same saved-record requirement. PNG and SVG are separate controls. Returned downloads must be a same-origin route or same-origin blob URL. Preview accepts those or a base64 PNG/JPEG data URL. Remote asset URLs, credentials and unsafe schemes are rejected. The adapter owns blob lifetime and should revoke allocated URLs when no longer needed.

Static codes are a pure generator: URL, text, Wi-Fi, vCard, e-mail, phone and SMS. They have no Save action and are not retained in the QR catalogue. Their structured content exists in component state while the form is open. No localStorage, cookies, telemetry or third-party image requests are used by this component. Static content cannot be changed after printing and has no scan statistics. Fields map as follows:

| Type | Fields |
|---|---|
| URL | `destination` |
| Text | `fields.text` |
| Wi-Fi | `fields.ssid`, `fields.password`, `fields.security` |
| vCard | `fields.name`, `fields.organization`, `fields.phone`, `fields.email` |
| E-mail | `fields.to`, `fields.subject`, `fields.body` |
| Phone | `fields.phone` |
| SMS | `fields.phone`, `fields.body` |

The adapter must map these to the pure payload builder's discriminated schema, validate all fields and avoid logging private static payloads. Blank optional fields must not create invalid URI or Wi-Fi values.

## Behavior and uncertain writes

The overview supports name/campaign/tag search, status filters, creation, editing, duplication into a new unsaved form, pause/activate and confirmed archive. Brands and locations come only from props. Changing brand clears the selected location. Busy state is visible; synchronous guards block double submission before React rerenders. Inputs remain available after known validation, permission or revision rejection.

Each mutation gets a UUID request ID. An unknown result, such as a lost network response, locks the form and new actions. Only **Prøv samme handling igen** is available and invokes the same captured operation with the same request ID and body. The server must implement idempotency. Known `revision_conflict`, `conflict`, `forbidden`, `unauthorized`, `invalid_input` and `invalid_destination` failures permit correction/cancellation because their API contract must guarantee no write occurred. Do not map an ambiguous transport failure to one of these codes. Reloading a page after an uncertain create is not an exactly-once guarantee; a future server reconciliation view must expose request outcomes before a new create is attempted.

## Verification boundary

`node --test tests/unit/qr-manager-browser.cjs` transpiles the actual component and runs it in Chromium against an intercepted synthetic API. It covers create/edit at 390 and 1440 pixels, scope/revision request context, input preservation, same-ID retry, conflict cancellation, duplication, archive confirmation, static Wi-Fi preview, hidden mutation controls, remote-asset rejection, saved-ID export, pause and filters. It does not load the complete application stylesheet and must not be represented as final visual or accessibility acceptance. It does not prove server authorization, production behavior, print quality or device scanning.

Before release: integrate actual route/API callbacks, map payloads and revisions, verify brand/location grants on the server, register focused tests in the existing CI inventory, run full repository typecheck and related suites, conduct an authenticated browser pass using actual styling, complete exact-head independent review, deploy and verify the deployed commit plus live acceptance. Logo upload, PDF/print layout, bulk CSV, analytics and conversion attribution are separate issues under #389.
