# Esmeralda V2 menu header (2026-11-02)

PO feedback on the V2 menu header. Presentation, plus two optional public location fields. Prices, cart and checkout logic are unchanged.

## Header
- **Desktop (≥768px):** one row. Pickup/delivery switch on the left, logo centred, **Log ind** and **i** on the right.
- **Mobile:** logo on the left with **Log ind** (icon) and **i** on the right. The pickup/delivery switch spans the row below.
- The burger button ("Gå til menukategorier") is removed on all widths.
- **No time picker in the menu.** `TimeSelector` takes `modeOnly`, and the V2 menu passes it, so only the pickup/delivery choice remains. The time defaults to "Hurtigst muligt" and is changed in checkout ("Ændre tidspunkt"). Brands other than Esmeralda, and V1, are unchanged.
- **Log ind** links to the Esmeralda Club login (`/club/login`, brand subdomain aware via `useStorefrontPath`).

## "i" popup (`LocationInfoDialog`)
The "i" button no longer expands a details card. It opens a dialog with:
- the location name and address (Google Maps link),
- Monday–Sunday opening hours (`weeklyOpeningHours`), with today in bold,
- contact: `location.contactPhone` (`tel:` link) and `location.contactEmail`, falling back to `brand.supportEmail`. Empty fields are hidden.

A Danish/English language switch is not included. The storefront has no translations yet, so that is a separate project.

## Banner
On desktop, the location photo (`location.imageUrl`) is always shown as an image-only banner. It is 168px high, 30% taller than the former details card, and as wide as the menu frame. Mobile does not show it.

## Search
On desktop, the search field sits to the right of the category pills. On mobile it stays above them.

## New location fields
`contactPhone` (max 30 characters: digits, spaces, `+`, `-`, parentheses) and `contactEmail` (valid e-mail). Both are optional and edited under **Kontaktoplysninger** in the superadmin location form. Both are validated client- and server-side, and both are included in the public location projection (`publicLocationRecord`). No migration is needed: existing locations simply show no phone or e-mail until one is filled in.

## Verification
```sh
npm run typecheck
CART_CHROMIUM_PATH=/opt/pw-browsers/chromium node --test tests/unit/menu-refresh-browser.cjs tests/unit/brand-location-edit.cjs tests/unit/checkout-browser.cjs tests/unit/commerce-p2-browser.cjs tests/unit/delivery-method-labels-browser.cjs
```

`menu-refresh-browser` covers:
- popup content and links,
- no burger and no time picker,
- the Log ind target,
- the one-row desktop header,
- the mobile logo on the left with the switch below,
- the 168px desktop banner and its absence on mobile,
- search to the right of the categories,
- no horizontal overflow at 390px and 1280px.

## Confirmation header (2026-11-07)

The order confirmation page omits the header back-to-menu link, which overlapped the logo on mobile. The brand logo, Club and restaurant information remain available. The back link remains on checkout before confirmation.
