# First-party QR membership attribution (#426)

The native Club signup can record `new_member` only when the new membership and
its `member_joined` event are committed. It measures creation of a membership,
not email verification, login, a newsletter signup, a reward or a purchase.
Existing-member signup, login and consent updates never create this conversion.

## Consent and transport

The prerequisite #422 issues an opaque, 30-minute `qr_touch` hint only for an
exact, server-mapped Club signup destination. A copied receipt is an attribution
hint, not identity or permission. The form reads only the current landing URL
when submitting, and only with the existing optional statistics consent. The
newsletter and Club-terms checkboxes remain independent and unchanged.

No receipt is copied to cookies, localStorage, sessionStorage or a new session
identifier. An unknown first-visit choice leaves only the currently visible URL
available for consent on that landing. Explicit denial on mount and consent revocation remove it from the URL;
later acceptance cannot restore a discarded touch. Submission rechecks current
consent even when no consent event was delivered. A successful neutral signup
response removes the query parameter as well. A direct visit stays unattributed.
This intentionally covers only direct QR landing on the signup page, not a
cross-page or cross-domain acquisition history.

Unrelated cross-tab storage updates (for example a cart) are ignored. Removal
of a previously observed consent, including clearing storage, discards the touch
even when an older cookie fallback is still readable.

The Club response uses `Referrer-Policy: no-referrer` on both canonical and
brand-prefixed routes, with matching metadata. The existing BrandTracking Club
guard remains in force: no Google, Meta or GTM integration is added to Club.
The receipt is never added to UTM, analytics events, contacts or login links.

## Atomic server behavior

The strict signup schema accepts an optional bounded `qrAttribution` object with
only `receipt` and `statisticsConsent`. The server resolves the brand from the
existing trusted public slug. Within the new-member transaction it revalidates
the receipt, original scan, current QR revision/target, brand/location ownership
and expiry through #422. Missing, invalid, expired, foreign or nonconsented
provenance produces no conversion and does not change the neutral signup answer.

`qrConversions` is server-only. A deterministic hash of the native brand,
`new_member` and newly created member ID identifies its document, so retries
cannot create extra conversion rows. The record contains only schema version,
conversion type, brand/location, QR/revision, scan event, scan/conversion time,
historical campaign/tags and the statistics-consent snapshot. It does not contain
a member/customer/source ID, name, email, phone, demographic information, raw
receipt or login secret. No reporting endpoint exposes records in this change;
scoped aggregate reporting remains #427. Existing records are not backfilled.

All reads precede writes. Conversion, member, identity and native joined event
commit or roll back together. Checkout signup remains unattributed by this
adapter until its distinct channel integration is explicitly implemented.

## Validation and release boundary

Focused transaction tests cover native signup, new/existing members, concurrent
retries, rollback, absent/denied/expired/foreign hints and strict schema. Actual
isolated Chromium form tests cover current consent, denial, revocation with and
without an event, later reacceptance, malformed/duplicate hints, unchanged
newsletter/terms acceptance, no browser persistence and unchanged Club tracking
guard. These tests use synthetic local data and intercepted membership APIs;
they are not production member creation or email delivery evidence.

Release requires current-main CI, independent current-code review, typecheck,
own tests and an actually deployed commit. Live acceptance is read-only: inspect
signup, consent behavior, no-referrer and lack of third-party tracking. No
production signup, test email, member mutation or QR scan is authorized here.
