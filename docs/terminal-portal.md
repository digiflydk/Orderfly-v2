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
