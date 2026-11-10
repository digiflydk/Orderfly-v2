# Website booking recovery and step routes (#904 / mPanel #447)

The current public website runs on Firebase App Hosting in this repository. Its booking page calls mPanel's `booking-api` directly. The older Webflow/widget bridge remains in the operations repository but is not the current website implementation.

| Step | Canonical public path |
|---|---|
| Availability | `/bordbooking` |
| Guest information | `/bordbooking/informationer` |
| Confirmed reservation | `/bordbooking/bekræftelse` |

Uppercase/encoded variants of these exact paths redirect to the lowercase canonical path. Unknown child paths and encoded slashes remain 404. Queries and fragments survive step changes; booking IDs, names and contact data are never appended to URLs. Substeps have noindex/nofollow/noarchive headers, no-store caching and are excluded from the 104-page sitemap. Booking CSP applies to all three exact routes.

`website-booking-page.ts` replaces the one captured booking script with the maintained `preview/esmeralda/adapters/website-booking.js` asset after payload hash verification. It also suppresses the mobile footer CTA throughout this mounted flow. Other captured markup is preserved. `/_booking/flow.js` is served without caching. The bundled capture is not regenerated.

## Recovery and data integrity

Before a confirmation can be sent, the exact selected slot, form payload and UUID request key must be written and read back from tab-scoped sessionStorage. If storage is unavailable the request is not sent. An uncertain response freezes the draft and reuses its key. Reload performs the read-only `recover` action first; it never automatically creates a reservation. If the server has committed, its authoritative summary is shown. Otherwise the guest may retry the same frozen request. Browser history cannot abandon an unresolved request to create another booking.

Completed state retains only the key and minimal booking summary, with guest values and the submission payload removed. Reload verifies the server result again, including cancellation or no-show status. A direct confirmation URL without matching state returns to step one. A new reservation requires the explicit new-booking action. Pending drafts expire after 32 days (longer than the present 30-day booking horizon), normal/completed state after one day. Closing the tab clears session storage; recovery is scoped to the same tab/session, not a cross-device booking-management link.

VIP is an **optional request**, confirmed separately by staff. The existing Esmeralda/Amager field and option are disabled below six guests and revalidated on submit. The API and database independently enforce the same minimum. Reducing the guest count clears an ineligible VIP selection before disabling it, including checkbox, radio and select rendering, so an ordinary booking can still be submitted. No table or room is automatically reserved by this option.

## Coordinated release

Apply mPanel migration `20261110185301_booking_atomic_responses_recovery.sql`, deploy its `booking-api` and `booking-admin`, verify read-only fields/recovery responses, then release this website change. The new API remains compatible with the previous website. Do not release the new frontend before recovery is available. Follow both repositories' normal exact-head CI/review and release gates. A merge is not deployment evidence. A website rollback may restore the old frontend while leaving the additive backend installed; do not drop the RPC while either updated API uses it.

## Verification

- `npm run typecheck`
- `node --test tests/unit/website-booking-flow.cjs tests/unit/website-booking-routes.cjs tests/unit/esmeralda-public-host.cjs`
- `node --test tests/unit/website-booking-browser.cjs` (Playwright Chromium, 390 and 1440 px, all network intercepted)

The tests cover uncertain replies, reload before/after commit, identical keys and frozen guest values, storage denial, conflicts, direct URLs, campaign preservation, canceled recovery and VIP limits. Browser tests exercise the actual server responses and rendered page. Alias responses are asserted against the real handler, then their target is visited explicitly: Playwright only intercepts the initial request of a redirect chain. This keeps every browser request inside the fixture. No test creates production reservations or sends email. Post-release verification reads all canonical/redirect URLs, asset headers and the public fields/recovery actions, then checks step navigation with intercepted synthetic bookings.
