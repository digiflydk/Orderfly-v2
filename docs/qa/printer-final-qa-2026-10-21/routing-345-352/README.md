# Saved routing (#345 API, #352 UI, parent #342) — isolated acceptance 2026-10-21

App: repo HEAD `9e1eef3` = merge of `origin/main` `9c068b1` into this evidence branch; `appSourceDiffVsOriginMain: "none"`. Later production `fdd2f3d` (PR #452, mPanel tests) has no printer/routing/access source changes. Environment `demo-orderfly-qa0`: real Next dev app, real Firebase Auth + Firestore emulators, accepted loopback guard, real `/api/admin/session` cookies in memory, headless Chromium restricted to 127.0.0.1:3100. No production writes.

| File | Result |
|---|---|
| `api-writes-on-result.json` | 51/51 — create/readback/edit/remove, revision CAS + concurrent PUTs, audit before/after/actor, 15 reference/shape rejections, CSRF/body/query bounds, foreign scope, stale-reference GET (`referencesVerified:false`) + rejected re-save + repair, corrupt stored doc, real audit-collision rollback, SDK retry under genuine contention (attempts=2, one commit), superuser revoked between attempts (attempts=2 → 403), read-only preview, catalog picker filtering, ordinary merchant 403 / anonymous 401, no-store/Vary, cleanup to empty emulator |
| `api-writes-off-result.json` | 15/15 — PUT 503 `writes_unavailable` with no doc/audit; reads, merchant 403, anonymous 401 |
| `ui-writes-on-result.json` | 19/19 — editor load, add/edit/remove + save with exact revision and native readback, preview (active printer receives, disabled printer reported), pending PUT locks, 409 conflict without overwrite + reload, accepted-but-response-lost and malformed success → uncertainty + blocked + single commit + manual reload, stale product reference note/preview disabled/repair, 375/1366 px no overflow, merchant Access Denied |
| `ui-writes-off-result.json` | 5/5 — real 503 message + blocked, real 401 clears data, merchant Access Denied |

Response-loss/pending/malformed cases are response-level fault injection with REAL request forwarding (`route.fetch()`), commit verified natively. `scripts/observer.cjs` counts SDK transaction attempts only. Scripts are scratch evidence drivers, not replacements for `scripts/local-qa/run-backend.cjs`.

Not covered: visible login form (#381/#382), production writes, routing consumption by checkout/outbox (#343), physical printing, Wolt.
