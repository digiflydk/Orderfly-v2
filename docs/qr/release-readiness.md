# QR release boundary (#389 / #402)

The integration PR #411 is the reviewable release candidate. Child PRs preserve isolated ownership and evidence; their old checks do not approve a newer assembled head. GitHub #389 contains the full task table, estimates, blockers and working agreement.

## Implemented candidate

- Native-session admin, scoped brand/location rights, static formats and dynamic permanent links.
- Revision-safe updates, idempotent receipts, metadata, expiry, status, independent copies and scoped before/after audit history.
- PNG/SVG previews and downloads, contrast/density/decode checks, ephemeral raster logos, safe print HTML and browser PDF dialog.
- Bounded CSV preview and atomic explicit confirmation with uncertain-outcome replay.
- Atomic redirect event/quota/lifetime counters; HEAD does not write. Persistent totals survive raw-event retention, remain unknown for legacy records, and require brand-wide analytics access.
- Retained detailed analytics with Danish dates/DST, opening/probable/excluded counts, devices/OS/browser/referrer origins, scan-time campaign/location groups, CSV and transparent incomplete/unknown states.
- Bounded retention via the existing authenticated heartbeat, with a persistent lease/cursor and no new service.

## Acceptance evidence and limits

Unit/service and actual Chromium component tests exercise successful behavior, input rejection, native boundaries, stale revisions, ambiguous retries, exports, mobile layout and historical scope. Separate local QA uses real Firebase Auth/Firestore emulators and the actual Next application, visible login, create/edit/readback, actual downloaded PNG decoding, mobile analytics and permission denials. Its documented exact source matters; repeat relevant scenarios on the final candidate. No HTTP mocks or production credentials are used in that local acceptance harness.

Production acceptance is not established by a local build or emulator. Before declaring Deployed/closed, the coordinator must verify current-main ancestry, every relevant current-head CI check, independent Codex review without unresolved findings or human holds, then serial merge/deploy, actual health release SHA and read-only live behavior. A current source main is not a deployed release.

## Production activation (#449 / #450)

PO/PM approved the activation scope on 21–22 October 2026. Verified before the flag was merged:

1. `docs/qr-firestore-indexes.json`: the three additive composites, including both brand-wide and current-location analytics forms, are READY in `orderfly-39325` (run 39691780053). The reserved `__name__` field cannot be configured; the retention sweep's document-name ordered collection-group queries over `qrScanEvents` and `qrRateLimits` succeeded read-only in production, with and without a start cursor (run 39725659082).
2. Live browser/API denial: anonymous 401, cross-origin 403, foreign brand 403; checked-in `firestore.access.rules` stays deny-all and unchanged. Changing rules still requires its own production approval.
3. `QR_MODULE_ENABLED="true"` (RUNTIME) enables public redirects, dynamic creation/import/export and bounded retention through the existing heartbeat. No secret or paid integration is involved. Rollback is a reviewed release that removes the flag; existing records and audit stay.
4. The only approved production test data is one brand-wide Esmeralda QR (`QR release acceptance #389`, campaign `internal-release-389`) with one HEAD, one mobile and one bot GET, readback and pause; its paused definition, receipts and audit are kept. Bulk, conflict and retention-limit scenarios are tested in isolated emulators only.
5. Physical phone-camera and printed-size acceptance requires actual hardware. Machine decoding of the rendered PNG is documented separately and does not count as a physical scan test.

Beyond the items above, no production data, rules, indexes, secrets or paid integrations have been changed. Conversion attribution, unique-person tracking and trusted geographic enrichment remain separate, unactivated follow-up issues #422–428. Scan-time campaign/location metadata describes the configured source, not an observed person's physical position. Cross-code aggregate reporting is not claimed by the single-code dashboard; it is tracked as development work in #478.

Project status emails go to the PO-approved address recorded in #389.
