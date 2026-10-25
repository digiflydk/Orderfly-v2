# Location terminal login: QA and release acceptance

Coordination: #635. Independent review/integration QA: #646 (Agent F). Release checklist: #647. This document records acceptance requirements; unchecked items are not test evidence.

## Acceptance matrix

| Boundary | Required success | Required rejection/recovery | Evidence owner |
|---|---|---|---|
| Location settings | Authorized administrator configures one location login; enabled state visible | Unauthorized/cross-location configuration rejected; passwords never returned or stored in public location DTO | A, C, E |
| Login | Dedicated portal accepts configured login and establishes location-scoped session | Wrong/disabled credentials rejected generically; durable throttling survives process/request instance changes; malformed requests rejected | A, E |
| Session persistence | HttpOnly persistent cookie renewed during use; session still valid beyond admin's eight-hour lifetime | Missing/forged/revoked session denied; server restart does not lose validity or revocation; no fixed server eight-hour expiry | A, D, E |
| Credential reset/disable | New credential works after reset | Every old session denied after reset/disable, including concurrent login/reset boundary | A, E |
| Tenant isolation | Orders/history/preorders limited to session location | Query/body tampering cannot select another location; simultaneous admin cookie cannot broaden terminal endpoints | B, E, F |
| Business mutations | Permitted transitions, explicit pickup payment, explicit reprint work | Other-location IDs, unpaid pickup completion, invalid transitions, replay/conflict and unauthorized print status denied | B, E, F |
| Browser lifecycle | Login reaches terminal; reload/new browser context with persisted cookie retains access; renewal occurs | Revocation removes cached order/details; transient failure masks data with retry; logout revokes server and clears cookie before navigation | D, F |
| Request integrity | Same-origin authorized requests accepted | Cross-origin login/logout/settings/order mutations rejected; cookies secure in production; cache cannot serve private session/order data | A, B, E, F |
| Existing features | Merchant admin session and existing terminal order flows retain behavior | Dedicated terminal principal cannot open administrative APIs or gain generic admin privileges | B, D, E, F |

## Evidence classification

- **Local service tests:** synthetic store/clock/request fixtures. Prove service contracts and authorization; do not prove deployed Firestore behavior.
- **Local browser integration:** actual rendered React components and browser cookies against synthetic HTTP services. Record browser version, test command and exact candidate SHA. Stored browser context persistence is not an actual iPad restart.
- **Production read-only QA:** verify deployed commit through health endpoint, portal rendering, unauthenticated denial/redirect and private-data absence. Do not configure credentials or exercise actual order/payment/printing writes without explicit authorization.
- **Controlled configuration acceptance:** credential provisioning and authenticated production operation require an explicitly authorized location/operator and test scope. Never put credentials, cookie tokens or hashes in GitHub, screenshots or logs.
- **Physical iPad acceptance:** operator verifies Safari/installed-web-app behavior after app closure and device restart, then explicit logout and credential reset. Browser storage removal, private browsing and browser-imposed cookie lifetime limits can require login again. A renewed 400-day cookie is not a guarantee of perpetual storage.

## Private database prerequisite

`firestore.access.rules` denies every direct client read/write recursively. Existing production activation evidence in `docs/printing.md` (2026-10-24, read-only rules preview run `40035010241`) records matching live/candidate SHA-256 `b19c7515e7e33841891e099379d9fea94c875a3d9a52d443a824948bdf9131be`. This protects new terminal credential/session collections without new allow rules. Coordinator must account for any subsequent rules changes; a local rules file alone is not deployed-policy evidence.

## Release checklist

- [ ] A–E changes integrated; branch contains current main; exact candidate SHA/tree recorded.
- [ ] Agent F independently reviews current production code, including credential/session durability, CSRF, throttle, scope and revocation races.
- [ ] Another agent reviews F-authored documentation/tests.
- [ ] Independent relevant service and actual-browser tests pass on candidate; typecheck and build pass.
- [ ] All required CI checks complete green on current head; current-head independent Codex review complete; no unresolved findings or human stop messages.
- [ ] Coordinator merges and deploys serially; verify merged base and actually deployed release SHA.
- [ ] Production read-only QA completed and recorded separately from local tests.
- [ ] Any authenticated/configuration/device acceptance still required has explicit owner and blocker; do not claim it passed from deployment alone.
- [ ] Close each issue only when its own acceptance and applicable release requirements are evidenced; update #635 checkpoint with branches, tests, reviews, release, outstanding work and estimates.

No manual GitHub Actions dispatch/rerun, production data writes, credential provisioning or physical printing are part of Agent F's tests. CI waiting, deployment waiting and device/access waiting are separate from active sprint effort.

## Candidate evidence

Pending A–E integration. Starting baseline: `15d0bc2` (deployed terminal PR #634). No new login tests or release checks are claimed passed by this initial checklist.
