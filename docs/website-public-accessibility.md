# Public navigation accessibility

The public footer's visible “Book bord” link incorrectly exposed the accessible
name “Kontakt os” through a stale `aria-label`. Screen reader users could not
distinguish it from the separate contact link. The footer repair removes only
that conflicting attribute on 103 captured pages. The visible text supplies the
correct accessible name. The booking destination stays `/bordbooking`. The
separate booking page did not contain this defect and is unchanged.

`scripts/preview-footer-booking-label.cjs` applies the bounded repair and updates
the payload's existing integrity metadata. The regression contract reverses
only that exact attribute change and reconstructs the complete 406-route parent
manifest hash from `ae203c3`, proving all other payload bytes remain unchanged.
The previous deep-page preservation contract retains its original baseline by
accounting for the same explicit reversible repair.

Run `node --test tests/unit/website-footer-booking-label.cjs` and the companion
`website-footer-booking-label-browser.cjs`. Browser fixtures intercept every
request and use synthetic public responses, including the booking destination.
The destination's automatic fields/availability POSTs are explicitly denied in
the fixture, and any confirmation/tracking or other unexpected request fails
the test. No provider request, booking or other production mutation is sent. The browser
tests cover the footer's exposed name on home/menu at mobile/desktop sizes,
keyboard activation to the booking page, and the native mobile menu's
Enter/Tab/Space behavior. Existing header labels that belong to a hidden legacy
navigation are outside the repair; the visible header already exposes correct
names.

This scoped check is not a complete accessibility audit or acceptance of
contact delivery, real booking submission, subscriptions or checkout. Price,
campaign and legal identity choices require separate authoritative evidence.
Production release and a read-only accessible-name/navigation check remain the
coordinator's responsibility after independent review.

## Legacy `/menu` category filter

The separate `/menu` page exposed category names as plain text because its
native radio inputs used `display:none`. The “all” reset was a nonfocusable div.
Pointer filtering worked after animation (75 dishes to 9 Pasta dishes), but
keyboard and screen reader users could not operate those category controls.
The inert category form also retained captured Webflow Turnstile metadata,
causing an unnecessary Cloudflare script request before consent.

The scoped repair retains the existing Finsweet filtering implementation and
all dish content. Native radios become visually hidden but keyboard/AX
accessible, with a focus ring on their label. Reset becomes a native
`type="button"` with its original text and layout. Only this category form's
Turnstile metadata is removed. Contact, booking, newsletter and their security
controls remain byte-identical. No new adapter or provider permission is added.

`scripts/preview-menu-filter.cjs` changes exactly `/menu`. The menu baseline
helper explicitly reverses its three transformations and verifies the exact
original `/menu` SHA256. The new regression checks all 406 reconstructed parent
entries against `e30423c3`; the other 405 payload entries remain unchanged.
Earlier bootstrap/footer baseline assertions keep their original hashes and
account only for the explicit, reversible menu repair.

`website-menu-filter-browser.cjs` intercepts every network request. At 390/1440px
it checks 11 named radio controls, Tab/Space/ArrowRight selection, actual visible
Pizza/Pasta dish contents after animation, pointer filtering, and Space/Enter
reset to all 75 dishes. Any external request, CAPTCHA, POST, unexpected
navigation or JavaScript error fails the fixture. This reproduces the actual
filter implementation without making provider or production calls.
The fixture observes both the expected contents/count and the list's completed
fade-in (`opacity` and Web Animations state) before the next interaction.
Finsweet replaces its list nodes before that transition ends; DOM count alone
is not proof that the list has finished rendering. The tests use no fixed
sleep or increased timeout. They establish the normal settled interaction
sequence, not a guarantee for arbitrary overlapping actions during animation.

## Remaining acceptance map, 29 October 2026

| Area | Existing evidence and technical status | Remaining acceptance requirement |
| --- | --- | --- |
| Public routes/navigation | 104 routes and source links audited; fixed footer names deployed in `e30423c3`; mobile native menu and keyboard booking navigation verified in isolated tests and scoped live checks. | Release the separately reviewed `/menu` filter fix and perform a read-only keyboard/filter check; this is not universal accessibility certification. |
| Menu/product handoff | Captured menu and product pages retain their links; root previously loaded Dully's restaurant catalogue and product options without ordering. | Confirm the intended sales channel and authoritative price source before changing any destination or price. Cart, checkout and purchase completion are not accepted by read-only navigation. |
| Consent/newsletter | Existing denied/grant/revoke/reload tests and actual newsletter render/withdrawal checks passed. Byte-pinned consent owner is unchanged by these page repairs. | Website GTM container `GTM-52G3QF76` needs the correct owned account and category/provider verification. No real subscription or delivery claim. |
| Contact | Captured form has disabled submit, POST method, no enabled flag/sitekey; local adapter prevents native submission and reports telephone fallback. Reviewed backend exists but is deliberately not deployed/activated. | Owned `WEBSITE_CONTACT_TURNSTILE_SECRET`, matching sitekey/domains/action `website_contact`, confirmed existing Mailtrap capacity, coordinated schema/template/consumer/frontend activation, then authorized controlled mail receipt. A blank form must not be used to bypass these prerequisites. |
| Booking | Root loaded the booking form and available times without a reservation; prior isolated success/error/idempotency checks remain separate. | Confirmation and delivery acceptance require an explicitly controlled authorized booking scenario. This audit creates none. |
| mPanel/terminal | Public login is visible; existing origin/auth-denial release evidence is documented in issue18. | Secure existing-user login to verify actual module visibility with unchanged grants; physical terminal/timelog acceptance requires its real device and authorized user where applicable. Public website fixtures cannot establish these. |
| Content | Existing campaign wording, website/channel price differences and legal identity are recorded without alteration. | Documented canonical business/price/legal sources and owner decision. Technical QA does not authorize guesses. |

Issue18's latest checkpoint is authoritative for release/acceptance status;
earlier integration-readiness documents describe historical migration stages.
No new code task is inferred from the access-dependent gates above.
