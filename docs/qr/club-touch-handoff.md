# Native Club QR touch handoff (#422 / #426)

The first supported handoff is a direct native Club signup destination:
`https://{brand.slug}.orderfly.dk/club/tilmeld`. The slug comes from the current
server-read brand, never from query labels. Only the six UTM query keys are
allowed; a fragment, arbitrary redirect parameter, different brand/host/path,
apex alias, external URL or existing `qr_touch` disables this optional handoff.
Ordinary redirect behavior is preserved for unsupported destinations.

Only a counted probable GET opening receives `qr_touch`. HEAD, known bots and
prefetch receive none. The redirect's existing transaction stores a SHA-256
proof hash and revision/destination/expiry on the same scan event; the raw random
32-byte proof is never stored. Its wire envelope contains the already-public QR
slug, scan event UUID and random proof. It contains no customer identity and is
an attribution hint, not identity proof: someone can copy a link. It never
authorizes membership, login, payment or access. No existing secret is reused,
and no cookie, device fingerprint, index, collection, paid service or signing
credential is introduced. The response remains `no-store` and `no-referrer`.

The random proof and event UUID are generated once outside the retryable scan
transaction. The saved proof expires exactly 30 minutes after the opening. The
existing 90-day scan-event retention removes the saved hash along with its event;
expiry is checked independently and does not wait for deletion. Historical scan
events without a proof cannot be reconstructed into conversions.

`readClubQrTouchInTransaction` is a read-only phase for the native signup
transaction. It first requires current optional statistics consent and a strict
receipt shape. It checks the public mapping against the native signup brand
before accessing any brand/code/event record; then revalidates active brand,
current native location ownership/activity, active code, revision, exact target,
original probable event, time window and proof hash. Invalid/expired/foreign or
unavailable evidence returns null without disclosing an error to signup. A new
native membership and its optional conversion must be written atomically by the
#426 consumer after all transaction reads. The verified projection preserves
the event's campaign/tags/location/revision; it contains no email, phone, name,
member ID or login/loyalty-QR secret.

The Club client must use current statistics permission at submit, remove denied
or revoked receipt parameters and never retain them in a new cookie or storage.
Newsletter consent is not statistics permission. Club third-party trackers stay
disabled, and its response must prevent referrer propagation. Direct visits,
invalid tokens and nonconsented signups remain unattributed; later consent does
not reconstruct previous actions. Receipt handling is not Google/Meta reporting.

This slice does not implement checkout or booking handoff, a conversion
dashboard, membership proof or production signup tests. Those require their
separate consumers and acceptance. #422's cross-channel scope must therefore
remain explicit when the Club subset is released.

Validation: `node --test tests/unit/qr-touch.cjs tests/unit/qr-redirect.cjs`
exercises success, external/foreign/unsafe targets, HEAD/bot/prefetch, denied
consent/no reads, forgery, expiry, future timestamp, deleted event, changed
revision/destination/brand/location, optional lookup failure and transaction
retry. `npm run typecheck` is required. The existing `qr-*.cjs` CI glob includes
the new suite. These are isolated tests, not production data or physical-camera
evidence. Release also requires independent current-head review, current-main
CI, actual deployed SHA and read-only live verification under AGENTS.md.
