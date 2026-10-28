# Website integration readiness — Website #24 / #46

Audit input: deployed design preview `e9e5bcb979bc9dff933c15531da7d2d58c2ad24a`,
immutable v8 source manifest
`d4461a074d59ab035e005035ed9aa33e64327a6cff26d953ac7c680a60afd4fc`.
This document records migration blockers, not full acceptance. The website is
still on Webflow at its production domain.

| Surface | Verified evidence | Remaining release requirement |
|---|---|---|
| `/book-bord` | The captured page contains only a loading mount, with neither a bridge nor its canonical redirect. The older Website PR50 description of ResOS is not accurate for v8. Ops `webflow/book-bord-legacy-redirect-head.html`, blob `954e6fedebd07b01c05e8228c8ef27672c6baf74`, establishes `/bordbooking` as the sole destination. This change restores a preview-only temporary redirect. | Coordinator verifies the deployed redirect, encoded query and browser fragment. This does not activate booking. |
| `/bordbooking` | Captured inline UI uses the existing `https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api`, omitting credentials. Website PR50 already contains seven isolated browser checks, including success, no slots, validation, 403, 409 and uncertain retry with the same idempotency key. | Current preview `connect-src 'self'` blocks the API. Actual provider/backend acceptance and confirmation delivery are not established by mocks or CORS. Do not remove the preview policy globally. |
| Canonical booking bridge | Current Ops source `webflow/bordbooking-widget-bootstrap.js` and `booking-widget/index.ts` fetch and validate the approved widget, then mount `srcdoc`; this is distinct from the captured inline UI. | A read-only live GET with `parent_origin=https://web.orderfly.dk` returned403; production `https://www.esmeraldapizza.dk` returned200 `text/plain`; an invalid parent returned403. The current widget origin allowlist does not admit the preview. Do not weaken this allowlist or iframe-message validation. |
| Contact `/kontakt` | The business form still has Webflow metadata, methodGET, no independent action and a public Turnstile sitekey. The cookie settings form is a separate form and must not be mistaken for the contact form. | #46 remains blocked on an approved public admission endpoint, server CAPTCHA binding/domain ownership and existing Mailtrap queue/template readiness. Recipient `ok@esmeraldapizza.dk` is confirmed. Never put submitted names/messages in a GET query, use a browser-supplied recipient or expose the existing server bridge secret. |
| Newsletter `/nyhedsbrev` | Omnisend embedded container `omnisend-embedded-v2-69676d920d7f53dc4d707a29`, launcher `https://omnisnippet1.com/inshop/launcher-v2.js`. Prior audit identifies unconditional duplicate launchers on six pages. | Provider domain/form settings and real delivery remain unverified. Preview CSP deliberately blocks the launcher. Existing consent issue #47 remains separate and must not be silently called passed. |
| Takeaway and club | Source links include Dully, `order.site/esmeralda-amager`, Wolt and `esmeralda.orderfly.dk/club`. They remain external navigation links. | Verify intended destination and restaurant identity in read-only browser navigation. Do not place orders or create accounts during unattended QA. |
| Map and marketing | Contact embeds Google Maps; source also references Meta/GTM and Omnisend. | Preview frames/external scripts are intentionally blocked. A production policy and service-level check are needed before cutover; opening all origins is not a migration fix. |

## Read-only origin evidence, 28 October 2026

`OPTIONS /functions/v1/booking-api` returned204 for the preview origin and both
production domain variants, with `Access-Control-Allow-Origin: *`, methods
`POST, OPTIONS`, and allowed headers including `content-type` and
`x-idempotency-key`. The inspected current handler source (Ops blob
`562a7996a2b750466a5713ec4b77d2b2c9b73112`) returns preflight before dispatching
any booking action. This establishes preflight reachability only. No POST,
booking, customer, newsletter, analytics event or mail was created.

`GET /functions/v1/booking-widget?parent_origin=...&organization=esmeralda&location=amager`
was used only to test the three parent-origin cases above; it does not execute
the returned widget. The allowlist handler source is Ops blob
`c55a398fbe46f07c1e49d82b7b452910f8d9dcea`. No secret/configuration values or
customer records were read. Supabase configuration was not changed.

## Bounded next work and ownership

- Coordinator: deploy/review this handoff, then read-only browser QA. Roughly
  0.1–0.2 active sprint plus build/review wait.
- #46 backend owner, after coordinator resolves service prerequisites: narrow
  public contact admission, fixed recipient/organization, bounded input,
  approved anti-abuse/CAPTCHA, idempotency and existing central notification
  queue. Separate endpoint/template and frontend/mock-QA slices, each at most
  one active sprint. Existing admin/server-secret endpoints cannot be exposed
  directly to the public form.
- Coordinator/provider owner: choose the approved booking runtime and verify
  its existing domain configuration, then provide a controlled service test
  scope for actual confirmation/delivery. Read-only origin checks do not grant
  permission for a test booking or configuration change.
- #24 coordinator: Omnisend, contact, booking and external destination live
  acceptance, independent from the static page/asset tests. No full website
  migration acceptance until these requirements are documented fulfilled.

No new service, paid plan, secret, DNS or production-data mutation was made by
this audit or handoff fix. Earlier seven mocked browser checks were read and
retained as prior evidence; they were not falsely reported as a new live run.
