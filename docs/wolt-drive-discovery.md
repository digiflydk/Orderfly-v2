# Wolt integration seams and isolated development

Issues #673/#672; shared coordinator #657. Inspected 2026-10-26 by `/root/contract`.
GitHub main verified as `3717189f3a46c9a01bbc388b69dace4bf4878862`. Initial clone inherited an active delivery coordination branch, so it was not assumed to be main. After main hydration, the isolated branch `feature/wolt-672-contract` was rebased onto that exact SHA.

## Existing work and ownership

The delivery chat has published shared contract proposal `98acf97ef6d7b70e61504e83fdb461562c4eb96c` and owns schema, storage, checkout, pricing, UI, payment compensation and serial release. Its local discovery/orchestration notes were read as work-in-progress evidence, not merged behavior. Wolt acceptance is in `wolt-drive-contract-review.md` and #674. Wolt source belongs under `src/lib/delivery/providers/wolt/`; no parallel migrations or checkout edits are authorized by this lane.

The existing scoped authorization helpers in `src/lib/access/scoped-data.ts` and terminal access in `src/lib/terminal-auth/access.ts` must remain authoritative. `src/lib/locations.server.ts` queries locations by brand. A Wolt binding resolver must validate location membership and active provider binding before obtaining credentials or doing provider I/O.

`src/lib/server/settle-checkout.ts` is server-only and already checks payment/order/brand/location identity, maintains payment idempotency and creates existing print and notification intents. Wolt must return results through the shared orchestration boundary, not directly alter kitchen, financial, confirmation or print state. No network dispatch in retried datastore transaction callbacks.

## Test environment

AGENTS.md distinguishes Firebase App Hosting `orderfly-v21-10334086-b3076` from data project `orderfly-39325`. Neither production project is an isolated test fixture. No environment variable values, credential files or production records were read in this discovery.

Internal focused tests can use `tests/helpers/load-ts-graph.cjs`, which transpiles TypeScript with explicit dependency mocks while retaining module identity. Supply fake scoped storage, controlled clock and mocked HTTP to exercise the actual adapter. Tests must cover tenant rejection, unsupported operations, malformed responses, timeout uncertainty, duplicate intent and reordered events. Run relevant `node --test tests/unit/wolt-*.cjs` and `npm run typecheck` when implementation exists; no tests have been represented as executed by this documentation task.

The verified official sandbox API host is `https://daas-public-api.development.dev.woltapi.com`; production host must never be selected by a fixture. Genuine sandbox credentials were provided to the coordinator; this document does not contain or verify them. Sandbox callback receipt, real API lifecycle and shared browser checkout acceptance remain separate tests. No production writes or paid pilot implied.

## Isolated grants

Each agent owns its own worktree, branch, PR and specific Wolt files/tests. This lane owns only this document and `docs/wolt-drive-contract-review.md`; it subsequently independently reviews implementation authored elsewhere. Delivery coordinator remains sole merge/deploy owner. New user rules require all checks internally and prohibit GitHub Actions. No existing protected checks may be bypassed.

## Remaining checks

Runtime auth/storage and deployed environment are not proven by source inspection. Shared durable intent/inbox implementations, browser handoff and callback routing require explicit integration verification. No complete remote-branch audit is claimed; agents must check current ownership before touching shared paths. No Wolt-specific paths were found in the inspected main tree, but filenames alone do not establish absence of behavior.
