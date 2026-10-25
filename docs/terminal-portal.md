# Merchant app and location order terminal (#635, #658)

Restaurant staff open their brand’s Merchant app at `https://{brand-slug}.orderfly.dk/mapp`, for example `https://esmeralda.orderfly.dk/mapp`. Without a valid terminal session, `/mapp` opens `/mapp/login`; successful login returns to `/mapp`. Logout or revocation returns to `/mapp/login` on the same host. The existing `/terminal/login` and `/terminal/orders` routes remain compatible and retain their original navigation. This portal has no merchant/superadmin navigation and no restaurant selector. Its fixed brand/location comes only from the authenticated terminal session. Client scope is still untrusted input; the dedicated backend independently enforces it.

`/mapp` and its nested routes pass through brand-subdomain routing instead of being interpreted as storefront location slugs. The brand slug `mapp` is reserved; an existing location named `mapp` remains reachable through its explicit `/{brand}/mapp` storefront path. The URL does not grant authority: all order access remains scoped to the authenticated terminal session.

## Persistent session lifecycle

The portal sends JSON `POST /api/terminal/auth/session` on startup, on foreground/focus/network recovery and every five minutes while visible. A valid response renews the backend's persistent `__Host-orderfly_terminal` cookie. The browser handles this Secure, HttpOnly, SameSite=Lax cookie; client JavaScript never reads it or copies it into local/session storage. Login credentials exist only in the form state and are cleared after the login response.

The cookie is host-only, with no `Domain` attribute. A session established on `orderfly.dk` is not shared with `esmeralda.orderfly.dk` or another brand host. Staff therefore sign in once on the new brand address; their existing location credentials still work. Navigating between `/terminal` and `/mapp` on the same host can reuse the same cookie. This change never broadens cookie scope or administrative privileges.

A server terminal session has no fixed eight-hour admin-session expiration. Its validity ends on explicit logout, credential reset or disable. The server supplies a renewable 400-day browser cookie. Browser retention caps, privacy policies, private browsing and clearing site data can remove cookies earlier, so this does not guarantee perpetual physical storage. Existing admin cookies/session rules remain unchanged.

Initial renewal must succeed before any order component mounts. A later401/403 clears the visible session and navigates to the entry point’s login page (`/mapp/login` for Merchant app, `/terminal/login` for the legacy terminal). A timeout/503 masks orders and actions and offers retry without deleting the persistent cookie or claiming logout. Successful retry mounts fresh order reads. Every renewal has an abort deadline and a generation check; an old response cannot overwrite a later logout. Hidden-page renewal resumes when the page becomes visible.

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
