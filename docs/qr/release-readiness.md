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

## Outstanding production prerequisites

1. Review `docs/qr-firestore-indexes.json`: three additive composites, including both brand-wide and current-location analytics forms, plus two `__name__` field-override entries for the retention sweep. Firestore does not allow configuring the reserved `__name__` field, so the additive index script verifies those entries by running the document-name ordered collection-group query read-only instead. The composites are READY (run 39691780053).
2. Establish that the **deployed** browser Firestore policy denies QR definition/index/event/audit/receipt/maintenance paths. Checked-in `firestore.access.rules` is deny-all, but source is not evidence of the live policy. Rules preview is read-only; changing rules requires its separate production approval and must not accidentally alter unrelated access.
3. Keep `QR_MODULE_ENABLED` OFF until index/access readiness is documented. Enabling it also enables public redirects and retention through the existing heartbeat. No secret or paid integration is required. Existing definitions may be managed while OFF; new dynamic exports/imports/creation fail closed.
4. A controlled production acceptance QR and its scan events would be production data writes. Select and authorize a test brand/location and the reversible scenario separately before creating it; never run unattended production seed/cleanup. Verify canonical-domain/proxy behavior on the actual deployed service before distributing printed codes.
5. Physical phone-camera and printed-size acceptance requires actual hardware. Machine decoding of the rendered PNG is documented separately and does not count as a physical scan test.

No production data, rules, indexes, secrets or paid integrations have been changed. Conversion attribution, unique-person tracking and trusted geographic enrichment remain separate, unactivated follow-up issues #422–428. Scan-time campaign/location metadata describes the configured source, not an observed person's physical position. Cross-code aggregate reporting is not claimed by the single-code dashboard.

The status email is blocked solely on a concrete authorized recipient. Automatic approval rejected the inferred historical address; no alternate channel or retry may bypass that decision. No email has been sent.
