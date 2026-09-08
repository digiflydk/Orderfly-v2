# Unified order flow — issue #71

This release extends the active `/{brandSlug}/{locationSlug}` storefront from
main `7518f2592987480326b35bca3fbc8934a206398b`. It does not create another store,
customer login or rewards system. Development, independent QA, PO acceptance,
merge and production activation remain separate gates. See [local evidence and
release QA](qa-order-flow-71.md). No production writes or campaigns were performed.

## Customer experience

- The order layout uses a compact restaurant header instead of marketing-site
  navigation. Existing fulfillment/time controls and server validation remain.
  Search and menu scroll are retained per native brand/location when storage works.
- Yellow `#FFBD02` identifies the primary action and selected category/method;
  secondary actions remain neutral. Existing bottom sheets, safe-area/keyboard,
  large targets, focus and reduced-motion behavior are retained.
- Shared cart contents/totals serve desktop, mobile and the 768–1023 px interval.
  Menu amounts exclude the bag and are labelled preliminary. Delivery minimum
  is shown before checkout with the exact shortfall and a return-to-menu action.
- Product plus adds directly when the product has no configured option groups.
  Otherwise it opens the existing editor; tapping the title opens details too.
  Required groups come first; optional groups collapse with a selection summary.
  Missing required choices get an actionable prompt and focus. An unavailable
  required group is also rejected by server restoration/price validation.
- Cart editing is a draft. Saving replaces exactly the original line; closing
  preserves it. Stale price/quantity/choice/deleted-line edits are rejected.
  Changing one combo group preserves the other groups. Saving an upgrade replaces
  the product with one combo. Different toppings retain separate identities.
- Edit/add/remove/quantity mutations synchronously persist the new choice snapshot
  and invalidate the previous checkout reference. The old payment in another tab
  cannot clear the edited cart. Existing fulfillment/bag safeguards remain.
- Checkout retains guest checkout, autofill, direct Stripe navigation, single-flight
  submission and uncertain-payment recovery. Voucher entry is collapsible.
  Newsletter consent stays optional and separate from terms/cookies. Danish UI,
  local prices and truthful pending/failed/paid receipt labels are included.

## Upsell and promotions

The combo editor now has `upgradeProductIds` (native IDs, at most 30). A selected
upgrade product must be in that combo's configured groups. The server verifies
all group products belong to the selected brand. No CPH-specific relation is
hardcoded. Only currently eligible, available combos are offered. The current
method's combo price and per-item difference are shown before opening its editor.
Product toppings do not silently carry into a different combo configuration;
the editor explains this before the customer selects the upgrade.

The existing upsell rules select recommendations in the cart, limited to three
canonical menu products. Products already in the cart or included in a combo are
suppressed. Dismissal uses the existing session-scoped handled-offer store.
Options use the same product editor. An accepted recommendation prevents a second
accidental add while its current offer is closing. Ordinary product plus buttons
still support intentional repeated additions.

`POST /api/public/upsell` is advisory, read-only and no-store. It validates native
restaurant ownership, method and a bounded 24 KB request; it projects only public
offer terms and product IDs. Admin conditions/counters are not returned. One
shared provider debounces cart changes by 400 ms and refreshes after 60 seconds;
the optional HTTP request has a two-second budget. It uses HTTP rather than the
Next Server Action queue. Menu navigation and Stripe submission never await it.
Final checkout still uses the existing uncached authoritative catalog/discount
validation. Displayed recommendations cannot authorize a browser-supplied price.

Configured active product/category promotions supply the compact menu tiles;
their real names, quantity rules, prices and minimums are shown. No fake urgency,
popularity, shipping or discount claims are introduced.

## Newsletter data contract

On a valid submitted checkout with the checkbox selected, the server first
creates/finds the native customer and then atomically records:

| Collection | Purpose |
| --- | --- |
| `marketingConsents/{eventId}` | Immutable brand/location/customer/email grant, channel, source, server milliseconds, wording and version |
| `marketingOutbox/{eventId}` | Durable pending job, contact key, state, attempts, lease and next attempt |
| `marketingContacts/{contactKey}` | Latest grant, current sync/suppression state and reconciliation schedule |
| `customers/{customerId}` | Existing `marketingConsent` updated with the same transaction |

The normalized email and brand produce a SHA-256 contact key. A random submission
UUID plus that key produces the event ID. The browser retains the UUID across
transport retries for that explicit decision, but stores no consent in the cart.
The server preserves the original event timestamp on duplicate submission.
Version `checkout-email-da-2026-09-08` shares its wording with the visible checkbox.
Legacy clients get one stable event with their original English wording; legacy
booleans cannot renew a suppression.

An unchecked submission creates no grant and does not unsubscribe an existing
subscriber. Email/checkbox changes reset the pending decision identity. The
existing discount eligibility and best-price logic remain authoritative; the
headline does not promise an additional saving when another discount is better.

The grant is independent of the later payment outcome. Stripe cancellation does
not retract a decision already explicitly submitted. Discount use is still
recorded only by confirmed payment settlement. If the local grant transaction
fails, checkout shows an actionable retry/remove-checkbox message before opening
payment; it does not falsely claim consent was saved. No Omnisend request runs
inside the payment action.

## Omnisend implementation and activation gates

The connected Work account was inspected read-only: it belongs to **Esmeralda
Pizza & Restaurant**, website `esmeraldapizza.dk`. It is not evidence of a CPH
Pizza connection. No default account, customer import, secret or production
mapping has been added. A CPH Pizza mapping remains an activation prerequisite.

The provider follows the current [contacts API](https://api-docs.omnisend.com/reference/post_contacts)
and [contact synchronization guide](https://api-docs.omnisend.com/docs/how-to-sync-contacts),
using API version `2026-03-15`. Each job verifies `/brands/current` against its
configured Omnisend brand before reading/upserting a contact. Payloads contain
email consent plus native brand/location/source/consent references. No SMS or
cookie/tracking consent is inferred from checkout information.

Only explicitly approved **single opt-in** configurations are supported by this
adapter. If a brand requires double opt-in, keep its mapping disabled: configure
and verify its supported confirmation flow before activation. Do not treat a
checkbox or an API upsert as completed double opt-in.

Set these server-only runtime variables through the existing hosting release
process. Do not commit actual keys or make them `NEXT_PUBLIC_*` variables:

| Variable | Contract |
| --- | --- |
| `ORDERFLY_OMNISEND_BRANDS` | JSON array of `{brandId, omnisendBrandId, apiKey, enabled, consentMode:"single_opt_in"}`; both brand identifiers must be unique |
| `ORDERFLY_MARKETING_WORKER_SECRET` | Independent randomly generated bearer secret, at least 32 characters |
| `ORDERFLY_MARKETING_ADMIN_UIDS` | Comma-separated stable Firebase Auth administrator UIDs |

Missing/invalid/duplicate mappings fail closed with `configuration_required`.
The code does not add mandatory secret bindings to App Hosting YAML that could
break a build before operators have provisioned them.

**Required before production collection of these new records:** deny all direct
client reads/writes to `marketingConsents`, `marketingContacts` and
`marketingOutbox` in the **data** project `orderfly-39325`. They are accessed only
through Admin SDK and guarded server routes. A specific `allow ...: if false`
does not override an existing permissive wildcard: Firestore grants are ORed.
Exclude all three collections from every broader granting match, and prove
anonymous and ordinary-client reads/writes fail. This narrow prerequisite does
not claim to solve the separate #57 database-security scope. Do not deploy new
PII collection until this check is complete.

Create/verify the `marketingOutbox` composite index `brandId ASC, createdAt DESC`
for the admin view. Worker queries require single-field ascending indexes on
`marketingOutbox.nextAttemptAt` and `marketingContacts.nextReconcileAt`.

Schedule authenticated `POST /api/internal/marketing/sync` periodically, e.g.
every minute, with `Authorization: Bearer <worker secret>`. The worker handles up
to ten due jobs and ten reconciliation records per invocation, uses a 120-second
lease and stops starting work after a 45-second budget. Provider requests have
five-second timeouts. Transient/429 failures use exponential backoff, starting at
one minute and capped at six hours, with eight automatic attempts. Permanent
configuration/4xx errors await intervention. Status contains safe error codes,
not raw provider responses or contact data.

`/superadmin/marketing` and `/api/superadmin/marketing` require an already-established
Firebase `__session`, revocation-checked server-side, and an allowlisted UID.
The current legacy permission placeholder is deliberately insufficient. This
branch does not implement a new login flow: providing/verifying this administrator
session is a release prerequisite. Without it, the page and APIs fail closed.
The page shows the latest 50 jobs for the selected brand, attempts, last update
and safe retry of failed jobs. Retrying cannot select a job from another brand.

Successful contacts are polled hourly for subscription status. A missing,
unsubscribed or non-subscribed email channel suppresses local marketing and
records provider status/time. An old job cannot overwrite a newer decision.
Only a new explicit current-version decision newer than a dated opt-out can
renew it under the configured single opt-in policy; an unknown opt-out time
fails closed. Payload timestamps never advance on retry.

`sendWelcomeMessage` is always false. No welcome campaign is enabled or emitted
by this adapter. Consent ID/version/source properties are available for a
separately reviewed brand workflow, but its deduplication/trigger behavior must
be checked before enabling real messages. A disabled mapping prevents external
sync; stop the scheduler as an additional operational pause. Preserve local
grant/outbox records for review rather than deleting them.

## Test-data publication and rollout

Products and combos now have an explicit optional `isTestData` field in their
existing admin forms. `true` prevents public menu rendering, cart restoration and
payment validation, independently of the visible name. Missing/false preserves
existing live catalog behavior. Updates from an older form do not clear the flag.

For existing suspected test content (including the previously reported
`QA47-Combo20260907`), an operator must first capture native document ID, brand,
locations, current flags and references, and obtain PO confirmation that it is
test content. Review a table of those exact records, then set `isTestData=true`
through admin. Confirm cache revalidation and fresh/old-cart rejection. Rollback
restores the reviewed prior flag. Do not auto-classify by QA/TEST name, delete
documents or change historical paid orders. No such live data changes were made
by Work Dev.

Activation is on hosting project `orderfly-v21-10334086-b3076`, with data in
`orderfly-39325`. Independent QA/review, PO acceptance, merge, private-record
rules/indexes, runtime configuration, controlled provider verification and live
verification must all be evidenced before #71 is marked Done.
