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
