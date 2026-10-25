# Terminal order progression (#620, #621)

The iPad terminal uses `POST /api/merchant/orders/status`. This is a narrow fulfillment operation, not a payment or cancellation API. Existing payment collection and cancellation workflows remain authoritative.

```json
{
  "orderId": "ORD-123456",
  "brandId": "brand-id",
  "locationId": "location-id",
  "expectedStatus": "Received",
  "status": "In Progress",
  "requestId": "872ec568-a597-4cd6-918b-09a100416fad"
}
```

The client creates one UUID for an intended action and retains the full command on uncertain responses. Retrying must use that same command and UUID. A new step uses a new UUID and the freshly read status. Unknown fields, invalid identifiers and arbitrary status values are rejected.

Allowed steps are `Received → In Progress → Ready → Completed` for Pickup and `Received → In Progress → Ready → Delivered` for Delivery. The expected current state must match. Pending, canceled, error and already completed orders cannot be progressed by a new command. No skipping or backwards transitions are accepted.

Verified payment permits progression. Accepted PayAtPickup orders with pending payment, held reservation, Pickup delivery type and no PSP may prepare and become Ready; completion requires separately recorded payment. The terminal never changes payment, discounts, reservations, invoices or print jobs through this operation.

The verified session and stored order scope are checked server-side. Every Firestore transaction attempt rereads the order, current access policy, native brand and location through `authorizeTransaction`. Caller brand/location values must match the stored scope. Revocation or reassignment during retry rejects the write. All reads precede writes.

Order status/update time and an immutable `auditLogs` record are committed atomically. Its deterministic ID binds the verified principal and request UUID; its fingerprint binds the full command. Reusing the UUID with a different payload conflicts. Exact replay still rechecks current authorization and returns the **current** stored status without another write, so replay after subsequent progress does not move the terminal backwards. The audit contains identifiers/statuses, not customer contact or secrets.

Success is `{success:true, changed:boolean, orderId, status}`. Errors are `{success:false,error,message}` with 400 invalid input, 401 expired login, 403 access denied, 409 stale/invalid progression or payment required, and 503 unavailable/uncertain failure. Responses are `no-store`; POST requires same origin, JSON, no URL query, no content encoding and at most 4096 body bytes. Internal errors are not returned to the client.

Completion invokes the existing deterministic optional feedback queue after the transaction. Queue failure does not undo saved fulfillment; exact completion replay may retry this idempotent queue. Implementation and local tests use synthetic I/O only and send no real customer messages.

## Validation and release boundary

`node --test tests/unit/terminal-status.cjs tests/unit/order-access.cjs` verifies the production service/HTTP code with synthetic transactions: successful pickup/delivery, accepted unpaid pickup, online pending and malformed payment rejection, stale/duplicate/concurrent commands, foreign scope/revocation, transaction retry and rollback, optional feedback failure, request validation and safe HTTP errors. This is not production or physical iPad acceptance. The integrated terminal browser flow, exact-current-code independent review, all required green CI, deployment commit verification and authenticated read-only live QA remain coordinator gates under #617.
