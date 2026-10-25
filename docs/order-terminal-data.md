# Brand order terminal read contract (#618 / #619)

`GET /api/merchant/orders` supplies a JSON-only operational snapshot. Authentication reuses the existing Orderfly cookie and fresh native `orderfly.orders:view` grants. It requires and independently verifies the selected native brand/location. Edit availability is separately checked for that exact location; permission-service failures fail closed rather than granting editing or returning a successful empty list. Responses are `no-store` and vary on the cookie.

## Parameters and result

Optional parameters: `brandId` and `locationId` together, `view=board|history|preorders` (default board), opaque `cursor`, `search` (maximum100 characters), and valid inclusive Copenhagen calendar `dateFrom`/`dateTo`. Unknown/duplicate keys and invalid/reversed dates are rejected. Date filters use the order's creation date, never an invented date for malformed legacy records. Search covers order ID, customer name, contact and phone. Missing scope selects the first authorized native location in deterministic ID order; no native locations returns an empty location selector. Explicit unauthorized scope returns403.

Types live in `src/lib/orders/terminal-types.ts`. `TerminalReadResult` includes authorized `locations`, selected scope, `canEdit`, `serverTime`, `orders`, `hasMore` and `nextCursor`. Each order includes immutable item names/quantities/prices and saved topping/combo labels, customer contact/phone/address/instructions, payment display fields, status and nullable ISO creation/fulfillment timestamps. Provider payloads, payment references, credentials and unrelated customer profile fields are excluded.

## Bounds, cursors and visible partial results

No new production index or data write is introduced. Each status is read by equality on brand, location and status, ordered by document ID, with a strict51-document limit:50 rows plus one lookahead. Board/preorder reads have three active statuses (maximum153 documents read); history includes all eight known statuses (maximum408). Location discovery is capped at200 authorized locations; exceeding the bound returns explicit409 `terminal_scope_too_large`, not a truncated selector. Existing central grant evaluation retains its own authorization implementation and limits.

The cursor records each status's last scanned ID or exhaustion and binds the selected scope, view, search and date filters. It conveys a scan position only, never access. Every subsequent request rechecks authority. Filters run after each bounded scan, so **a page can have zero matching rows and still have `hasMore=true`**. UI must retain Load more and a visible partial-result label, and must not describe loaded counts as global totals. Read until `nextCursor=null` to exhaust a selected view. Changing scope/view/search/dates invalidates and resets the cursor.

Rows are sorted chronologically **within the loaded result**, not globally before pagination. History uses descending creation time; kitchen/future rows use ascending fulfillment time (falling back to creation time for legacy records). Clients may merge/deduplicate and sort accumulated rows. Do not label the first page as the newest50 orders. This explicit bounded-scan tradeoff avoids a production index migration. A later globally chronological indexed query would be a separate change.

The result is a live scan, not a multi-request database snapshot. Status changes or new rows during pagination are recovered by the next first-page refresh. On refresh, clients must reconcile/reset loaded snapshots rather than retain removed active rows forever. No read operation prints, changes status, settles payment or sends notifications.

## Queue eligibility and dates

Only Received / In Progress / Ready enter active views. Verified paid orders are eligible. Accepted unpaid pickup remains visible only with PayAtPickup, Pending payment, held reservation and no PSP object; online pending/failed transactions do not enter the kitchen. Completion is separately enforced by the transactional status service.

Preorders are active orders whose authoritative `fulfillmentAt` falls **after today's Europe/Copenhagen calendar date**, using server time. Same-day scheduled orders stay on the board with their scheduled time visible. Malformed or missing fulfillment dates are not inferred from human-readable deliveryTime: they remain on the board with a null timestamp, for operator attention. History includes all known statuses and excludes no order merely because payment is still pending.

## Verification

`node --test tests/unit/terminal-read.cjs` exercises actual production modules with synthetic Firestore/auth I/O: exact native scope, revoked grants and foreign native location, edit permission versus infrastructure failure,127-row pagination/deduplication, empty filtered continuation, cursor filter binding, Copenhagen DST/future routing, accepted-unpaid eligibility, creation-date filters, malformed timestamps, minimal food/customer projection, invalid inputs and sanitized HTTP failures. Typecheck is required separately. This is isolated service verification, not production session or physical iPad/printer acceptance.
