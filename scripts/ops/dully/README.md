# Daily Dully operations

Scripts for the PM-approved daily routines: the Dully import (#824, #834) and feedback reply drafts (#901). They used to live in the session scratchpad and were lost when the container was rebuilt, so they now live here.

## Requirements

- Environment variables (never printed): `ADMIN_DULLY_EMAIL`, `ADMIN_DULLY_PASSWORD`, `ORDERFLY_TEST_ADMIN_NAME`, `ORDERFLY_TEST_ADMIN_PASSWORD`.
- `npm ci` in the repository (for `date-fns-tz`). The container's preinstalled Playwright is used when available.
- The orderfly.dk session is stored outside the repository, in `$ORDERFLY_OPS_STATE` (default `<tmp>/orderfly-ops-state.json`). It is created automatically and renewed when it expires.

## Feedback import

```
node scripts/ops/dully/feedback-import.cjs preview   # fetch only, no writes
node scripts/ops/dully/feedback-import.cjs import    # import + print counts
```

- Fetches Esmeralda orders from 2026-10-31 to today with details: name, phone, lines and the real completion time.
- Checks that the superadmin Dully page is bound to brand `oeypKaMyYcQjIwaa1PtV` and location `eibiesSbluQTmp3mUqly`.
- Imports in batches of at most 100. Each batch is all or nothing on the server.
- Dully returns order lines in a random order. Lines are sorted by Dully line id, so an unchanged order stays "uændret".

## Customer and purchase delta

```
BATCH=20 node scripts/ops/dully/customers-import.cjs import <YYYY-MM-DD>   # normally three days back
node scripts/ops/dully/customers-import.cjs list <YYYY-MM-DD>              # order numbers and dates only
```

- Timestamps are UTC ISO, the same as the stored purchases. The server rejects a changed order identity.
- `ONLY_ORDER=<order number>` limits the run to one order, which is useful for a safe format check.
- Dully's marketing-subscriber evidence is not included.

## Feedback reply drafts

```
node scripts/ops/dully/feedback-drafts.cjs inbox
node scripts/ops/dully/feedback-drafts.cjs detail <feedbackId>
node scripts/ops/dully/feedback-drafts.cjs save <feedbackId> <text file>
```

- `save` only clicks "Gem kladde". It refuses if the approval checkbox is checked and never clicks "Godkend og send".
- Output masks e-mail addresses and phone numbers.
