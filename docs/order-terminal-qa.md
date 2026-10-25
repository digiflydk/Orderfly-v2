# Brand order terminal acceptance (#617)

This matrix separates code review from executable QA and production acceptance. A synthetic browser fixture is not a logged-in production session, physical iPad, or a printed receipt. No production orders, messages, settings or print jobs may be created by unattended tests.

## Reproducible local checks

Run the terminal service suites and `npm run typecheck`, then the actual-component browser suite:

```sh
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/order-terminal-browser.cjs
```

The browser harness bundles the actual terminal React components with the production Tailwind/admin CSS. It supplies synthetic HTTP responses and a stub for the existing payment server action, binds its fixture server to loopback, and does not authenticate or contact production. Assertions about payment settlement or authorization must also pass the corresponding real-service tests. Browser screenshots are diagnostics, not production acceptance.

| Area | Scenario and expected result | Evidence required |
|---|---|---|
| Location scope | Select a permitted restaurant; orders and mutations use that exact brand/location. Switching context clears old selection, pagination and pending results. | Read-service grant/revocation tests, browser context-switch test |
| New orders | Accepted orders appear in the New column, with items, modifiers, notes, pickup time and payment label. Unpaid online Pending is not accepted. | Read-service eligibility and actual board rendering |
| Progression | Received → In Progress → Ready → Completed for pickup or Delivered for delivery, with UI refreshed from server. | Transaction-service tests plus browser action flow |
| Unpaid pickup | Preparing and Ready are allowed, but collection is blocked until payment is registered through the existing payment function. Status action never collects payment. | Real-service payment rejection and browser disabled/explained action |
| Races | A stale expected status gets conflict; duplicate same request is safe; retries retain request identity after uncertain response. Revoked grants and foreign order fail closed. | Real-service concurrency/idempotency tests and browser conflict/retry |
| History | Historical rows have date/search and location scope, details and explicit reprint control. Empty results and additional scan pages remain understandable. | Read-service pagination and browser history flow |
| Preorders | Future Copenhagen calendar dates are separately displayed and sorted. Same-day timed orders remain on board. Unknown timestamps are not silently misclassified as valid future dates. | DST/date-boundary tests, browser future view |
| Bounded reads | Counts describe loaded orders, not global totals. Load more remains available even when a filtered scan page is empty. | Read pagination test and browser empty-scan pagination |
| Alerts | First load does not sound for old orders. Audio is enabled only after user gesture; genuinely new visible orders alert once. | Feed test and browser audio stub; physical iPad sound check separately |
| Connectivity | Failed refresh shows stale/offline indication; retry/focus/reconnect recovers; no failed mutation is represented as success. | Browser transport failure/recovery |
| Access failure | 401/403 clears inaccessible data or prevents its continued display and gives a safe login/access response. No accidental fallback to another brand. | API and browser rejection tests |
| Print | Viewing does not print. Explicit kitchen/customer choice uses eligible same-location printer. Queue acceptance is not printed confirmation. Unknown output retries preserve identity. | Merchant-print service and actual reprint browser tests |
| iPad layout | 1024×768 landscape and 768×1024 portrait: no horizontal page overflow, visible readable CTAs, touch-friendly targets, details usable. | Browser computed layout/screenshots |
| Accessibility | Named controls and dialogs, usable focus/close, explicit errors/statuses, text conveys state independently of color. | Actual-component browser assertions and visual inspection |
| Release | Latest main included, exact-head own tests and independent review clean, required CI green; serial merge/deploy and actual health release confirmed. | Coordinator release record |
| Live read-only | Login as a permitted merchant and inspect terminal/history/preorders; foreign location inaccessible; no real status/payment/print mutation. | Authenticated production evidence on deployed SHA |
| Physical | iPad Safari audio enable, screen sleep/resume and reconnection; controlled authorized paper print if required. | Human/device evidence; remains pending until observed |

## Evidence ledger

F1 started 2026-10-25 at main `37dd01c`. Implementation and browser execution initially pending A–E contracts. Independent review F2 must name the exact integrated SHA. F1 tests require another agent's review; their author cannot attest independent approval of them. No deployment, live session, physical hardware or paper success is implied by this document.

### F1 local result, 2026-10-25

12/12 independent actual-component Chromium tests passed against the composed A DTO, C terminal/feed/detail, D history/preorder and E reprint UI snapshot. Coverage includes 1024×768 and 768×1024 layout, paid progression, separate history/future views and restaurant switching, stale connection recovery, open-modal access revocation, automatic empty-first-page traversal, status conflict, explicit pickup payment confirmation, read-only controls, history query wiring, and sound opt-in/new-order deduplication while history is open. The sound API is synthetic; this does not prove iPad speaker output. Backend authorization/payment/print semantics are tested by separate real-service suites.

Initial review found stale access display, pagination alert noise, disappearing-order fallback and first-page new-order starvation. C changed the feed to clear data on access rejection, traverse every bounded board page before completing a scan, retain a single baseline across tabs and close details absent from the authoritative response. Final integrated SHA verification and physical/live acceptance remain coordinator gates.
