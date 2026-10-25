# Dedicated location order terminal (#635, #642, #643)

Restaurant staff open `/terminal/login`, sign in with the configured location username/password and use `/terminal/orders`. This portal has no merchant/superadmin navigation and no restaurant selector. Its fixed brand/location comes only from the authenticated terminal session. Client scope is still untrusted input; the dedicated backend independently enforces it.

## Persistent session lifecycle

The portal sends JSON `POST /api/terminal/auth/session` on startup, on foreground/focus/network recovery and every five minutes while visible. A valid response renews the backend's persistent `__Host-orderfly_terminal` cookie. The browser handles this Secure, HttpOnly, SameSite=Lax cookie; client JavaScript never reads it or copies it into local/session storage. Login credentials exist only in the form state and are cleared after the login response.

A server terminal session has no fixed eight-hour admin-session expiration. Its validity ends on explicit logout, credential reset or disable. The server supplies a renewable 400-day browser cookie. Browser retention caps, privacy policies, private browsing and clearing site data can remove cookies earlier, so this does not guarantee perpetual physical storage. Existing admin cookies/session rules remain unchanged.

Initial renewal must succeed before any order component mounts. A later401/403 clears the visible session and navigates to `/terminal/login`. A timeout/503 masks orders and actions and offers retry without deleting the persistent cookie or claiming logout. Successful retry mounts fresh order reads. Every renewal has an abort deadline and a generation check; an old response cannot overwrite a later logout. Hidden-page renewal resumes when the page becomes visible.

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

Run existing `order-terminal-browser.cjs`, `terminal-feed-browser.cjs`, `merchant-reprint-browser.cjs` and `receipt-reprint-controls-browser.cjs` to check unchanged merchant defaults, plus `npm run typecheck`. Root owns exact-head CI/review, serial release and separate production read-only acceptance. No Actions dispatch, production credentials or real orders/payments/print jobs are created by these checks.
