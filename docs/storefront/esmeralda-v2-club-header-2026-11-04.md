# Esmeralda V2: shared header, info popup, banner, landing and signed-in checkout (2026-11-04)

PO feedback, implemented after plan approval (PO answers: first name in the header; "← Menu" on the left of the checkout header).

## Shared header (`MenuHeader`, V2)
The landing page (`/`), the menu and checkout now share one header.

| Page | Left | Centre | Right |
|---|---|---|---|
| Menu | Pickup/delivery switch | Logo | Account and "i" |
| Checkout | "← Menu" (back to the location's menu) | Logo | Account and "i" |
| Landing | — | Logo | Account and "i" |

- **Account:** shows **Log ind** for guests. A signed-in Club member sees their **first name**, which links to `/club`.
- **Rendering:** `data-v2-bar` (`menu`/`checkout`/`landing`) selects the layout. `BrandLayoutClient` renders `MenuHeader` on the V2 landing page instead of the generic `Header`.

## "i" popup (`LocationInfoDialog`)
- **Layout:** a dark sheet with gold accents. It opens from the bottom on mobile and as a centred 440px dialog on desktop.
- **Status:** an open/closed pill, "Åben nu · lukker kl. 22:00" or "Lukket nu · åbner kl. 11:00", computed in Copenhagen time from today's hours.
- **Cards:**
  - *Adresse:* the address plus a "Vis rute" button (Google Maps).
  - *Åbningstider:* Monday–Sunday, with today highlighted and tagged "I dag".
  - *Kontakt:* phone and e-mail as buttons.

## Desktop banner
The location photo shows the information it had before 2026-11-02 again:
- name,
- address (Maps link),
- today's opening hours,
- for delivery, the delivery price ("Leveringspris beregnes i kassen" for managed delivery) and the minimum order.

On desktop the small delivery summary under the header is hidden, because the banner carries it. Mobile is unchanged.

## Landing page
"Vælg restaurant" uses the 1300px frame, the V2 typography and V2 location cards (border, 280px, gold "Bestil her"). Selecting a card still opens the pickup/delivery sheet.

## Checkout for a signed-in Club member
- **Session data:** `getClubSessionProfileAction` (`src/app/club-session-actions.ts`) reads the host-only HttpOnly Club session with `readSession`. It returns only the member's own name, e-mail and phone; the phone comes from the brand's customer record for that e-mail. It is read-only, and without a valid session it returns `{ signedIn: false }`. These are the same fields the Club portal shows. `useClubSession` loads it and reloads it when the tab regains focus.
- **Prefill:** name, e-mail and phone fill **empty** fields once. Typed values are never overwritten, and the customer can edit them.
- **Discount card:** with the member's e-mail in place, an existing personal discount card is offered and applied automatically through the unchanged `getDiscountCardCheckoutOfferAction` and server-side `readDiscountCardCheckout` checks.
- **Wording:**
  - Signed in: "Logget ind som {navn} · Min Club".
  - Guest: "Er du medlem af {Club}? Log ind i Club".
  - The "personligt rabatkort" wording is removed in both cases.
- **No signup card for members:** signed-in members are not offered "Bliv medlem" (`clubSignupShown` excludes them).

## Verification
```sh
npm run typecheck
CART_CHROMIUM_PATH=/opt/pw-browsers/chromium node --test tests/unit/menu-refresh-browser.cjs tests/unit/checkout-browser.cjs
```

`menu-refresh-browser` covers:
- the popup: address, the "Vis rute" link and today's marker,
- the banner text,
- the first name in the header.

`checkout-browser` covers:
- the "Logget ind som" text, with no discount-card wording,
- typed values kept,
- empty fields prefilled in V1 and V2,
- no signup card for members.

The browser fixtures mock `@/app/club-session-actions`.

## Follow-up after live verification
- In V2 checkout, the page-level "Tilbage til menuen" is hidden, because the shared header's "← Menu" covers it. V1 keeps it.
- The V2 checkout content uses the same gutters as `.storefront-frame` (104/48/32px), so it lines up with the header at every width.
