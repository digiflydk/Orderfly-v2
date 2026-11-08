# Merchant app and location order terminal (#635, #658)

Restaurant staff open their brand’s Merchant app at `https://{brand-slug}.orderfly.dk/kds`, for example `https://esmeralda.orderfly.dk/kds`. The default `/kds/login` accepts the existing employee login; employee sessions use scoped merchant order permissions. Restaurant terminal credentials remain under `/kds/login/terminal`, returning to `/kds?terminal=1`. Without an employee cookie, an existing terminal session is still reused. The terminal-session lifecycle below applies to that separate mode. The existing `/terminal/login` and `/terminal/orders` routes remain compatible and retain their original navigation. Terminal mode has no merchant/superadmin navigation and no restaurant selector. Its fixed brand/location comes only from the authenticated terminal session. Employee mode uses the existing authorized restaurant selector. Client scope is still untrusted input; the dedicated backend independently enforces it.

`/kds` and its nested routes pass through brand-subdomain routing instead of being interpreted as storefront location slugs. The brand slugs `kds` and `mapp` are reserved; existing locations with these names remain reachable through their explicit `/{brand}/kds` and `/{brand}/mapp` storefront paths. The URL does not grant authority: all order access remains scoped to the authenticated terminal session.

## Persistent session lifecycle

The portal sends JSON `POST /api/terminal/auth/session` on startup, on foreground/focus/network recovery and every five minutes while visible. A valid response renews the backend's persistent `__Host-orderfly_terminal` cookie. The browser handles this Secure, HttpOnly, SameSite=Lax cookie; client JavaScript never reads it or copies it into local/session storage. Login credentials exist only in the form state and are cleared after the login response.

The cookie is host-only, with no `Domain` attribute. A session established on `orderfly.dk` is not shared with `esmeralda.orderfly.dk` or another brand host. Staff therefore sign in once on the new brand address; their existing location credentials still work. Navigating between `/terminal` and `/kds` on the same host can reuse the same cookie. This change never broadens cookie scope or administrative privileges.

A server terminal session has no fixed eight-hour admin-session expiration. Its validity ends on explicit logout, credential reset or disable. The server supplies a renewable 400-day browser cookie. Browser retention caps, privacy policies, private browsing and clearing site data can remove cookies earlier, so this does not guarantee perpetual physical storage. Existing admin cookies/session rules remain unchanged.

Initial renewal must succeed before any order component mounts. A later401/403 clears the visible session and navigates to the entry point’s login page (`/kds/login/terminal` for explicit terminal mode, `/terminal/login` for the legacy terminal). A timeout/503 masks orders and actions and offers retry without deleting the persistent cookie or claiming logout. Successful retry mounts fresh order reads. Every renewal has an abort deadline and a generation check; an old response cannot overwrite a later logout. Hidden-page renewal resumes when the page becomes visible.

Logout immediately hides orders and cancels pending renewal. Navigation to login occurs only after server revocation and cookie deletion are confirmed. A timeout/failure leaves a masked retry screen explaining that logout was not confirmed; renewal stays paused even between retries. The server logout is idempotent, permitting a safe retry after a lost response.

## Dedicated business endpoints

- Read: `/api/terminal/orders`
- Progression: `/api/terminal/orders/status`
- Pickup payment: `/api/terminal/orders/payment`
- Printer discovery/request/status: `/api/terminal/orders/reprint`

Portal requests never fall back to merchant/admin authority. The existing terminal components accept optional endpoint/shell props; defaults retain the existing `/merchant/orders` behavior. Changing the read endpoint resets the feed generation. Reprint endpoint changes invalidate pending UI state and keep authorization choices outside receipt commands. A denied reprint triggers a session recheck. Payment uncertainty never counts as payment success.

## Validation

`CART_CHROMIUM_PATH=<local Chromium> node --test tests/unit/terminal-portal-browser.cjs` bundles the actual login, session guard, terminal/detail/reprint components and app CSS. A loopback HTTPS fixture returns synthetic sessions/orders and real Secure HttpOnly cookies. Cases cover wrong credentials, successful scoped login, absence of administrative links, storage-state context restart, cookie renewal, temporary outage, revocation, uncertain logout/retry, delayed renewal during logout and dedicated payment/reprint routing. No production account or credential is used.

Browser storage-state restoration demonstrates browser-cookie persistence mechanics, not a physical iPad power-cycle. Actual iPad Safari/installed-app restart, browser retention and device audio remain separate acceptance. Real service authorization, durable revocation, hashing/throttling and payment effects are covered by backend suites, not by this synthetic UI fixture.

Run existing `order-terminal-browser.cjs`, `terminal-feed-browser.cjs`, `merchant-reprint-browser.cjs` and `receipt-reprint-controls-browser.cjs` to check unchanged merchant defaults, plus `npm run typecheck`. For this delivery, the PO’s explicit instruction recorded in #658 replaces the previous GitHub Actions/external-review waiting gates: validation consists of internal tests, independent internal review and coordinator approval on the actual candidate. Root alone performs serial merge/release and verifies the deployed commit and separate production read-only acceptance. GitHub Actions are neither dispatched nor used as release gates. These tests create no production credentials, orders, payments or print jobs.

Legacy `/mapp` and `/mapp/login` redirect to `/kds` and `/kds/login/terminal`. Existing host-only terminal sessions are reused. The admin terminal-settings link opens `/kds`.

## KDS employee login

`/kds/login` now uses the existing employee name/PIN login (`/api/admin/session`), with the optional existing Firebase account method. Successful login returns to `/kds`. A verified Orderfly session with `orderfly.orders:view` (or platform superuser access) opens the shared terminal using only `/api/merchant/orders` and its existing scoped read/edit, payment and print authorization. No username, employee ID, or brand permission is hard-coded, and this change creates no account or additional role grant. Omair can therefore use his existing employee/superadmin identity rather than separate terminal credentials.

The separate restaurant credentials remain available at `/kds/login/terminal`, returning to `/kds?terminal=1`. That explicit mode uses only the terminal session and terminal APIs, including when an expired employee cookie remains on the device. Without an employee cookie, `/kds` can still reuse an existing terminal session. A rejected employee identity never silently falls back to terminal authority. Login failures, permission denial and service outages remain distinct; data APIs reauthorize each request. Employee logout returns to `/kds/login` and revokes only the employee session.

## Brand-bound employee KDS and sound (2026-11-07)

Employee `/kds` resolves the brand from the request hostname, then reads native
locations and current access policy in a read-only transaction. On
`esmeralda.orderfly.dk/kds`, Esmeralda is selected before the browser requests
orders. A single permitted location is shown as a label immediately; multiple
permitted locations within the same brand remain selectable. Unknown or ambiguous
brands and revoked permissions fail closed, without selecting another brand.

`GET /api/kds/orders` repeats hostname and permission resolution on every request.
Its server-only scope context avoids discovering all of a superadmin's brands and
repeating session checks. Query parameters cannot supply this context or escape
its locations. Existing merchant status, payment and print authorization remains
in use. Dedicated terminal login continues to use its separate terminal APIs.
Status queries run concurrently and managed-delivery enrichment uses at most four
concurrent transactions. Each tracking transaction still rechecks fresh ownership
and permissions. Pagination, order limits and the 12-second client timeout remain.

Sound defaults to on at 80% on a new device. The sound toggle and volume are saved
in local storage, including an explicit muted preference. “Lydindstillinger” has a
“Test lyd” button and a 0–100% slider. The test enables sound and plays the same
3.6-second melody used for new orders; volume zero stays silent. Device volume
still applies. No melody plays merely because the board opens. Browsers requiring
a gesture show an activation message until “Test lyd” is pressed. The background
history/preorder feed never owns a second notification audio context.

Validation: local typecheck, production build, `kds-scope.cjs`,
`kds-employee-access.cjs`, `terminal-read.cjs`, `order-terminal-browser.cjs`, and
existing dedicated-terminal/login/status regression tests. No GitHub Actions.
Authenticated production timing must be checked with an actual employee session;
unauthenticated live checks alone do not establish that the timeout is resolved.

## Kitchen workflow, dates, clock and alarms (2026-11-07)

KDS employee and dedicated-terminal views enable `kitchenMode`. Cards display all
items/modifiers, notes and large direct fulfillment buttons. Details, payment
confirmation, ready-time editing and print controls stay inline; no order modal
is needed. Existing payment prerequisites, optimistic status checks, audit and
idempotent retries remain enforced. Printer discovery is lazy so visible cards
cannot each generate two background printer requests before Genprint is opened.

The board sends `serviceDate`, defaulting to today in Europe/Copenhagen. This is
the fulfillment date, falling back to creation date only for orders without a
fulfillment timestamp. It includes preorders created earlier but due today and
excludes yesterday's unfinished orders by default. The date input can inspect a
different day, and I dag restores automatic rollover at midnight. History retains
its creation-date search and preorders retain their separate future-day view.
Cursors bind the service date as well as the existing scope/filter fields.

A card clock uses a saved `kitchenReadyAt`, then the bound courier pickup interval
when available, then fulfillment time. Missing/invalid time is explicitly unknown.
It counts down with a negative sign when late and stops at Ready. Tapping it opens
an inline minutes-from-now editor (including +5/+10/+15 buttons). The employee or
dedicated terminal `/orders/ready-time` POST rechecks native scope and edit access
inside a transaction, compares the previous saved time and records an atomic audit
entry. Retries reuse the same request ID. Only Received/In Progress orders can be
changed, within the next 24 hours. This changes the kitchen target only: customer
fulfillment time, provider booking and payment fields are untouched. No messages
are sent and no courier rescheduling is implied.

Menu contains sound enablement, four original synthesised sounds (Melodi, Klokke,
Marimba, Alarm), test, volume and overdue minutes (default 5; range 0–120). Each
sound lasts 3.6 seconds. Browsers do not expose the iPad's native system-sound
catalogue, so no Apple sound files are copied. Preferences are device-local.
Overdue Received/In Progress orders trigger a grouped alert and repeat at most
once per minute while the data is authorized/current and sound is available.
Marking Ready, changing the target, or muting suppresses subsequent alarms.

Fullscreen keeps an independent fixed, internally scrollable KDS surface with
overscroll disabled and an explicit × exit. A native fullscreen exit gesture does
not close the KDS surface. Browser/OS fullscreen and home gestures cannot be
forcibly locked by a web application; add to the iPad home screen for standalone
browser chrome removal.

Connection correction: a manually loaded history/preorder snapshot does not become
an alleged disconnected feed solely after 45 seconds. Board freshness and all
explicit failures still count. A single transient read failure with a complete
snapshot younger than 45 seconds retries immediately, displaying reconnecting;
repeated errors, expired snapshots, offline and authorization denial remain visible.
401/403 still clear cached customer data immediately. The client timeout is 25s,
allowing the existing 12s identity-upstream deadline plus database work. Read APIs
emit server time at response completion for the countdown, not at request start.

Local validation covers kitchen browser actions/payment, all item details, day
selection, signed countdowns, alarm thresholds, time conflict/replay and authority,
settings persistence, fullscreen scroll/native exit, stale-history recovery and
existing terminal authentication/status regressions. GitHub Actions are not used.

After an uncertain inline payment response, Kontrollér betalingsstatus requires a
new authorized read before enabling another explicit payment confirmation. A failed
refresh never unlocks it; paid orders are reconciled without another payment write.

### Compact KDS header and push updates (7 November 2026)

KDS has a hamburger button beside the title. Its Settings panel separates Sound
(test, melody, mute and volume) from Order settings (overdue alarm threshold).
Audio activation/error help lives inside Sound settings instead of a page-wide
banner. Logout sits immediately beside Refresh for both employee and terminal
sessions. On tablet landscape the service-date selector and right-aligned view
tabs share a row; they wrap on narrow screens. The service-date helper is removed.
Kitchen status buttons now follow the order-number header, before the clock and
customer details. The existing Copenhagen service-date semantics are unchanged:
fulfillment date, falling back to creation date, independent of kitchen-only ETA.

KDS now subscribes to cookie-authenticated notification-only SSE at
`/api/kds/orders/events?brandId=…&locationId=…` or the dedicated terminal equivalent.
Source is fixed by the route. Employee access resolves the host-bound KDS scope;
terminal access validates its own session and native location transaction. Unknown,
duplicate or foreign scope parameters fail before any subscription is established.
The channel sends only empty `ready`, `change`, `heartbeat`, `access`, `unavailable`
and `reconnect` events. It never sends order/customer/policy/session contents.

Three server-side Firestore listeners watch the selected restaurant's active
statuses without pagination limits, so changes beyond the first page are not lost.
Managed delivery orders also watch their five tracking documents, including
courier completion. Status departures remove those subscriptions. Notifications
are coalesced for 250ms and cause the existing authorized read API to refresh the
complete board, and the other view if open. The original cursor completion,
new-order deduplication and explicit payment-confirmation guards still apply.

Policy/native brand/location changes immediately close the channel with an access
invalidation; dedicated channels additionally watch their session and credentials.
Authorization is rechecked after initial listener snapshots to cover subscription
races. Every reconnect and every order read/mutation revalidates authorization.
External identity revocation without a policy update is detected on the next
API read or stream renewal; no customer data travels on the persistent channel.

Healthy KDS no longer polls order data every 15 seconds. Heartbeats every 15s
perform no database reads and keep an unchanged board from falsely becoming stale.
Streams renew after 240s, below App Hosting's documented 5-minute request limit;
renewal performs a complete read to close any disconnect gap. Browser heartbeat
loss after 45s disables stale actions; retries back off from 1s to 30s. Failed
order reads may retry after 60s; manual refresh, focus, online and mutations also
refresh. The non-KDS merchant board keeps its existing polling behavior.
All listeners/timers are released on abort, cancellation, error or lifetime expiry.

This reduces repeated idle order queries, not all costs: listener initial snapshots,
document changes and reconnects incur Firestore reads, and a long-lived Cloud Run
request consumes runtime. No promise of a lower total bill without live usage
measurement. No database rules/index changes, production writes or GitHub Actions
are required for this release.

Validation: local typecheck/build, synthetic browser layout/settings/date/status/
payment tests, an idle 120-second heartbeat test with zero additional order reads,
push refresh and denied-access masking, plus server subscription isolation,
revocation, tracking changes and cleanup tests. Production checks are read-only;
an authenticated physical iPad session is not covered by these synthetic checks.

References: [Firestore listener billing](https://firebase.google.com/docs/firestore/pricing),
[App Hosting request limits](https://firebase.google.com/docs/app-hosting/product-comparison).

### Manual updates, closing hours and preorder release (7 November 2026)

Under Menu → Order settings, **Automatic updates on this device** can be disabled.
The first page load and explicit user reads (Refresh, changing scope/view/date,
settings saves and order actions) still fetch authorized data. Timers, focus,
visibility, online events and SSE do not fetch while disabled. Dedicated-terminal
periodic session renewal also pauses; initial login verification and explicit
access failures remain checked. The preference persists locally. Audible overdue alarms require a snapshot/read or live heartbeat no older than
45 seconds, independently of manual-mode presentation. The last complete
snapshot remains visible as **Manuel opdatering** with its update time, not a false
connection error. Countdown/colour changes run locally and incur no API calls.
The automatic date rollover waits until automatic updates resume or Refresh is
pressed. Manual mode cannot discover new orders without a read.

Location-wide settings are stored on the native location with a monotonic revision:

| Setting | Default | Range |
| --- | --- | --- |
| Preorder release / print lead time Y | 30 minutes | 0–1440 |
| Yellow warning before kitchen deadline Z | 5 minutes | 0–120 |
| Red warning and sound after deadline A | 5 minutes | 0–120 |
| Sleep outside opening hours | Enabled | On/off |

Saving uses same-origin POST `/api/kds/orders/settings` or
`/api/terminal/orders/settings`. Sources are fixed by each route. Employee KDS
uses its host-bound location and live `orderfly.orders:edit` authority; dedicated
terminals use their own freshly authorized scope. The transaction rechecks native
brand ownership, expected revision and request identity and writes an audit entry.
Identical uncertain retries are idempotent; stale or reused commands conflict.
No authority is inferred from a UI checkbox. Location changes invalidate existing
push channels and cause a freshly authorized settings read on other online KDS.

**Nattilstand** closes KDS subscriptions and pauses background/session reads outside
the location's `openingHours`, interpreted in Copenhagen time including overnight
shifts. Unknown/invalid hours fail open. It retains the snapshot in memory, allows
manual refresh, wakes at opening or one minute before a known preorder's release,
and stays awake while Received, In Progress or Ready orders require attention.
This is a pause in KDS communication, not a durable offline application or offline
mutation queue. Other devices, checkout and the physical printer's own polling are
independent. Orders arriving while asleep are discovered on wake/manual refresh.

The KDS board requests `includePreorders=1` together with its service date. The
server returns authorized active orders for that date plus future fulfillment,
with the flag bound into cursors. The client partitions Received orders at
`fulfillmentAt - Y minutes`; In Progress/Ready orders never return to preorders.
This also handles same-day preorders and releases crossing midnight. Explicitly
selected dates keep their date filter. Tabs show counts of unhandled Received
orders. After the first complete snapshot, a newly discovered preorder plays the
selected notification melody and shows **Forudbestilling modtaget** with a button
to open preorders. Existing first-load orders are silent. Browser audio activation,
mute and device volume still apply. Release happens locally without polling.

New original print intents capture future `scheduledFulfillmentAt` in the existing
canonical queue, retaining deterministic identity. Ordinary CloudPRNT dispatch
skips held jobs until the same location lead time is reached, so a held job cannot
block an immediate order. Unsent TTL starts at release, not purchase. Changing
the preorder lead time gives held jobs a fresh collection window; changing only
alarm/night settings does not reset print age. The existing five-minute
unsent window, activation epoch, immutable content, one-download and explicit ACK
safeguards remain. Already offered/downloaded/confirmed jobs are never rescheduled
or reprinted; historical jobs without scheduling metadata retain their original
policy. No migration or retrospective printing is performed. Automatic printer
configuration must already be enabled for the restaurant.

Received and In Progress primary actions and clocks pulse yellow from Z minutes
before the kitchen deadline, then red from A minutes after it. Delay sound repeats
at most once per minute until handled; an edited kitchen-ready time remains
separate from customer fulfillment time. Inline customer/items/notes/total details
start collapsed behind **Vis ordredetaljer**. Order number, large actions, clock,
payment uncertainty and explicit payment controls remain visible.

Validation uses local TypeScript/build and synthetic Node/Playwright tests for
manual/closing-hour call counts, session renewal, settings authority/replay/conflict,
preorder popup/audio/badges/release, collapsed details and both status warnings,
plus original print waiting, expiry, queue ordering and exactly-once dispatch.
No GitHub Actions or production data writes are part of the test process.

### Compact bilingual KDS and history (8 November 2026)

The KDS menu offers Danish and English, persisted per device without a server
write. Operator labels change; customer names, item names and kitchen notes retain
their original contents. Calendar dates remain in the restaurant's Copenhagen time.
The header contains the title, location name only, and right-aligned connection
status/update time. Full screen and Refresh follow History in the view toolbar;
all five controls have icons, and icon-only actions have accessible names.
Logout is inside Settings for both employee and dedicated terminal sessions.

KDS history initially selects today's Copenhagen order-creation date. The history
feed initially reads one bounded page. If this exhausts the result, the complete
gross total appears immediately. Otherwise the operator can explicitly choose
“Beregn samlet beløb for alle ordrer” to traverse every cursor, including empty
filtered pages, and obtain the complete total/count. Date/search filters currently
run after the existing scoped database query; automatic traversal would scan the
whole archive, so it is never performed on view entry, push, focus or refresh.
Refresh invalidates a prior complete total and again reads one bounded page.
During loading, partial results or errors the UI never claims a complete total.
A database-level date index is a separate performance improvement; this release
introduces no index dependency or production migration. This is the sum of order amounts,
not net revenue; refunds remain separately visible. Columns are Date/time,
Order/customer, Amount, Status and Actions. View/reprint actions use labeled icon
buttons and retain the existing authorization and explicit print-confirmation flow.
