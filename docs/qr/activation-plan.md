# Production activation runbook (#449)

Executed by PR #450, which turns the module on in production. PO/PM approved this scope on 21–22 October 2026. The preconditions below were verified before merge (evidence in #449); the controlled acceptance scenario runs only after the deployed release is confirmed. `release-readiness.md` holds the current production state. Keep this runbook for incident work and any later re-activation after a rollback.

## Exact configuration change

Add only `QR_MODULE_ENABLED="true"`, availability `RUNTIME`, to `apphosting.yaml`. This enables public QR redirects, dynamic creation/import/export and the existing heartbeat's bounded 90-day event/24-hour quota cleanup. It adds no secret, scheduler, paid service or tracking identifier. Other environment entries are unchanged.

## Preconditions

- PR411 source and this activation delta independently reviewed with current-main ancestry, green relevant CI and no unresolved findings or human stop.
- Three additive composites in `docs/qr-firestore-indexes.json` are READY in data project `orderfly-39325` (verified: run 39691780053). Use only the additive workflow; never replace/delete indexes. The reserved `__name__` field cannot be configured; the retention sweep's document-name ordered collection-group queries must succeed read-only (verified: run 39725659082).
- Existing denial policy evidence: issue139 comments5678232687 and6221153272. Confirm current deployed browser denial still covers all QR collections (verified live: anonymous 401, cross-origin 403, foreign brand 403). No rules change is involved.
- Hosting is `orderfly-v21-10334086-b3076`, backend `studio`; it must continue using data project `orderfly-39325`.
- A real native authorized production session is available without recording credentials in GitHub. Physical phone/print acceptance is separately documented.

## Controlled production acceptance (approved)

Approved for this exact scenario and brand. First verify `/api/health` reports the reviewed deployed merge (or a later main containing it), before any production test record is created; repeat that release check after the scenario:

1. Create one brand-wide QR via the authorized UI/API in existing Esmeralda brand `oeypKaMyYcQjIwaa1PtV`: name `QR release acceptance #389`, campaign `internal-release-389`, destination `https://example.com/qr-acceptance`. No customer/order/payment data is involved.
2. Verify native stored record, immutable create audit/receipt, zero lifetime, and PNG decode to its permanent apex URL.
3. Open the permanent URL once with a mobile request and once with a known-bot request, without following the destination. Verify two events/openings, one probable/one excluded, unchanged business revision and the actual 302 Location. HEAD must redirect with no event/counter write. Confirm analytics/history and a denied access case through actual native sessions.
4. Pause the test QR, verify 404 and no added event. Keep the paused definition, receipts and immutable audit. Do not delete production data as cleanup. Event expiry follows the specifically accepted retention policy.
5. Verify actual `/api/health` release SHA contains the reviewed merge, record index/access/rollout evidence and live results in449/389. Mark physical scanning/printed-size acceptance passed only after actual hardware evidence. Do not call the entire module Deployed/closed merely because App Hosting completed.

Rollback means disabling this flag through a reviewed release if acceptance fails, opening a revert PR when required by AGENTS.md, and reporting the failure. Existing records/audit are retained. Never silently remove production data or modify unrelated access policy.
