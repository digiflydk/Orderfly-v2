# Failed 3D Secure and unconfirmed session expiry

The controlled Worldline Europe test on release `ad19d865` produced a hosted
3D Secure error with CVC001. Subsequent authenticated expiry of the original
session returned HTTP403/action code40200. Normal authorized checkout and
no-card cancellation passed separately. The failed case remains unconfirmed;
this document does not claim that a financial or cancellation fix is verified.

## Identify the provider rejection

Worldline action codes are unique only within `meta.action.source`.
Cancellation now keeps the bounded numeric code and a known source in its
support diagnostic. When source and code are valid, the server performs one
read-only lookup using the original pinned agreement:

`GET https://data-v1.api-eu.bambora.com/responsecodes/{source}/{actioncode}`

The lookup has a two-second timeout, no redirects and no retry. Its response
must report success and echo the exact source/code. Static catalog labels are
examined only to choose a finite diagnostic category. Labels, raw messages,
authentication, session tokens and complete provider responses are never
returned, logged or saved. A failed diagnostic lookup preserves the original
numeric support code. The category is a troubleshooting hint, not financial
proof or permission to release a reservation.

## Cancellation authority

The existing original-account binding, payment-operation lock, native Paid
checks, verified transaction handling and reservation-identity checks remain
in force. HTTP403,404, a negative provider result, or a diagnostic category of
SESSION_EXPIRED still leaves cancellation pending. No duplicate checkout,
capture, refund or blind financial retry is introduced.

Read-only comparison of the earlier controlled sessions showed that both a
previously Paid session and an unpaid failed session can subsequently have
`status: expired` at the hosted client's internal `/checkout/{token}` endpoint.
That undocumented status is not sufficient evidence of no payment and is not
used as a new financial authority.

## Verification and release

Run typecheck, the response-diagnostics cases, existing expiry/capacity and
Stripe-cancellation regression cases, plus desktop/mobile cancellation browser
cases locally. Do not run GitHub Actions; commits and PR title use `[skip ci]`.
After release, check health for the exact deployed commit, then make one
explicit check of the original controlled cancellation to identify the actual
provider category. Do not report this condition resolved until the corrected
behavior passes a fresh failed-3DS sandbox case and ordinary cancellation and
payment regression checks.

Sources:
- https://developer.bambora.com/europe/checkout/guides/integrating-api
- https://developer.bambora.com/europe/checkout/api-reference/data
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/checkout
- https://github.com/bambora/checkout-magento-v2.x/blob/master/Model/Api/Checkout/Data.php
