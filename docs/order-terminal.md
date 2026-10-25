# Brand order terminal

Coordination and complete backlog: GitHub #617; scoped delivery issues #618–631.

The authenticated `/merchant/orders` route is a touch-oriented Danish terminal. The merchant overview and Commerce menu link to **Ordreterminal**. This route uses the full viewport width; other merchant/admin pages retain their navigation. Authorization is still enforced by the server layout/page and every scoped data operation.

## Operator flow

Choose the permitted restaurant. **Ordrer** separates new orders, preparation and ready orders. Inspect products, modifiers, notes, fulfillment time and payment before advancing. Accepted unpaid pickup orders may be prepared, but payment must be explicitly recorded before collection. Online payments awaiting provider confirmation are not accepted kitchen orders. Delivery completion is distinct from pickup collection.

**Historik** provides date/search controls and order details. Reprint is an explicit request to the existing kitchen/customer receipt pipeline, with its own authorization, idempotency and uncertain-output safeguards. A queued print is not proof of physical paper output. Printer administration remains superadmin-only.

**Forudbestillinger** contains orders scheduled after today's calendar date in Europe/Copenhagen. Same-day scheduled orders show their fulfillment time on the active board. Missing or invalid schedule data is never invented. Reading or opening future orders never changes their status.

Each data request is bounded and paginated. The active board automatically traverses every continuation on each polling scan, including while history or preorders are open, so a new order beyond the first page is not silently missed. The previous complete snapshot remains visible during a scan; incomplete/failing scans are not presented as fresh complete results. History and preorder pagination use explicit Load more controls; counts describe loaded orders, not an unverified global total. Search/date filtering may produce an empty page while a continuation remains. Do not interpret that state as absence of matching orders. Connectivity/freshness is visible.

Audio requires an operator gesture and browser permission/support. Initial loading does not announce old orders as new. iPad Safari suspension/background behavior cannot be guaranteed by a web page; keep the terminal visible while in service and verify alert behavior on the restaurant's device.

## Technical ownership and validation

- A: JSON DTO, scoped read service and endpoint; `order-terminal-data.md`.
- B: transactional progression, expected-state conflict and payment guards; `order-terminal-status.md`.
- C: board, detail, polling and alerts.
- D: history/date/preorder components; `order-terminal-views.md`.
- E: merchant reprint authorization and controls; `order-terminal-print.md`.
- F: independent browser acceptance matrix and review; `order-terminal-qa.md`.
- Coordinator: authenticated page, dedicated layout, navigation, integration and release.

No production orders, customer messages, configuration, or physical print jobs are created by development tests. Synthetic service tests, actual-component browser tests, authenticated read-only production verification and physical hardware acceptance are reported separately. No GitHub Actions dispatch, rerun, workflow change or outsourced test execution is part of this task. Existing required automatic CI is a release gate, not a substitute for local validation.

## Release gate and current limitations

Merge/deploy requires current main in candidate, completed green applicable CI on current code, independent Codex review without unresolved findings/human holds, local tests/typecheck/build, then actual deployed SHA and authenticated live verification. Release evidence belongs #631/#617. This document does not claim deployment or physical acceptance.

Physical iPad alert/sleep behavior and actual paper output require observed hardware evidence. No issue may be closed solely because code is merged. Missing access/device evidence must retain a named owner and next action in GitHub.
