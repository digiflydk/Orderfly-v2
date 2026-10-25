# Dedicated location terminal operations (#638, #639)

The location portal authenticates through its own `__Host-orderfly_terminal` cookie. It never becomes an Orderfly administrator or a generic staff identity. Server route selection is explicit:

| Route | Authority |
|---|---|
| `GET /api/terminal/orders` | Dedicated terminal session, assigned location only |
| `POST /api/terminal/orders/status` | Dedicated session and fresh transaction scope |
| `GET/POST /api/terminal/orders/reprint` | Dedicated session and fresh order/printer scope |
| `POST /api/terminal/orders/payment` | Dedicated session, complete native pickup settlement |
| Existing `/api/merchant/orders*`, staff payment and superadmin print functions | Existing administrative/staff session only |

Missing or invalid terminal credentials cannot fall back to an administrative cookie. Having both cookies does not broaden a dedicated portal request. Conversely, adding a terminal cookie does not change existing merchant behavior. The authentication source is selected by fixed server code, never a query or command field.

`src/lib/terminal-auth/access.ts` carries a discriminated actor. Terminal actors retain the exact frozen core session capability. Every mutation attempt calls core `authorizeTerminalTransaction` inside that same Firestore transaction, which rereads persisted session, enabled credential revision, native brand and location. No generic `VerifiedIdentity` is manufactured, and terminal authorization is not added to `orderflySession`, generic server actions, administrative pages or printer administration.

## Read and progress

The read service exposes only the session's location and revalidates its current core authority before querying. Explicit foreign brand/location selections fail. Existing bounded pagination, food projection and paid/accepted-pickup eligibility remain unchanged.

The status service preserves the expected-state transition, immutable request audit, payment requirements and idempotent replay. A retry still rechecks session revocation and scope before accessing saved request results. Existing terminal status request/response shapes are unchanged.

## Recorded pickup payment

`POST /api/terminal/orders/payment` accepts exactly `{orderId, method: 'cash'|'card'}`. The browser never supplies an amount, employee identity, paid flag, location grant or invoice. It requires bounded same-origin JSON. Successful responses contain `{success:true, changed, message}`; exact existing payment replay returns `changed:false`. Authorization errors remain 401/403, known ineligible orders return409, and uncertain/infrastructure failures return a sanitized503, prompting an authoritative order refresh.

`settleTerminalPickupOrder` establishes the dedicated actor itself and invokes the existing private financial plan. It preserves order eligibility, discount/capacity settlement, invoice counters, paid aggregates, payment audit, confirmation queue and atomic print/outbox behavior. It does not copy or bypass financial mutations.

When printing is enabled, `verifyTerminalPickupPrintPayment` establishes a source-bound opaque origin. The origin records `terminal` internally; each preparation resolves that same server session source and revalidates its actor and current scope. The original `verifyPickupPrintPayment` remains staff-only. Both feed the existing private transition and settlement capabilities, including native transaction identity, expiry, rollback and write budgets. Terminal actor IDs are stable hashes, not credentials. No customer sends or physical printing are performed by development tests.

## Reprints

Dedicated `readTerminalPrint` and `requestTerminalPrint` establish the terminal session internally and reuse the existing merchant reprint machinery. The terminal's session is revalidated both before rendering and in the commit attempt. Order, native brand/location, printer and credential revisions, existing request ownership, immutable content hash, atomic audit and unknown-output blocking remain enforced. The minimal printer picker confers no printer administration access. A queued job still does not prove physical paper output.

## Validation boundary

`tests/unit/location-terminal-operations.cjs` exercises source separation, real native settlement and invoice/replay behavior with print feature on/off, foreign/revoked/invalid payment cases, progression, dedicated HTTP mode selection, request validation and sanitized failures. Existing terminal read/status, merchant reprint, pickup proof and full financial/print regression suites remain required. These tests use synthetic I/O. Independent actual-core/native revocation tests belong to #645; browser portal lifecycle belongs to #643. Current-code review, all required CI, deployment and live acceptance remain coordinator gates under #635.
