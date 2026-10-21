# QR payload rules (#390, coordination #389)

Implementation candidate only. These pure functions are not yet connected to any public redirect, API, administration page or production data store.

`src/lib/qr/payload.ts` exports:

- `normalizeDestination(input, {blockedOrigins?})`: HTTPS only, no credentials, nonstandard ports, whitespace or backslash repair. Canonicalizes a terminal DNS dot before comparing own/custom origins. Rejects local/private IPv4 literals, all IPv6 literals, local hostname suffixes and the Orderfly `/q` redirect namespace. Custom QR origins must be supplied through server-owned configuration to reject their `/q` namespace too.
- `applyUtm(destination, tags, options?)`: source, medium, campaign, term and content, maximum 200 characters each. Existing unrelated query parameters and fragment are preserved. Supplied tags replace only the same UTM parameter. Unknown tag names are rejected.
- `buildStaticPayload(input, options?)`: discriminated `url`, `text`, `wifi`, `vcard`, `email`, `phone`, `sms` input. URL payloads use the same HTTPS policy. WiFi syntax and vCard fields are escaped. Mail subject/header and contact fields reject CRLF; mail/SMS bodies are encoded separately. Mailto headers use URI percent encoding (`%20` spaces, `%2B` literal plus), with body newlines normalized to CRLF before encoding.
- `QrPayloadError`: stable code (`invalid_input`, `invalid_url`, `blocked_destination`, `payload_too_large`) and field, without echoing raw input. `MAX_QR_PAYLOAD_BYTES` is 2000 UTF-8 bytes, also checked after escaping/URL encoding.

Static codes contain their payload directly, cannot change destination after printing and do not provide scan analytics. WiFi passwords/contact data in a static code are readable by anyone holding the code. UI must explain this and avoid logging payloads.

## Boundary

No network I/O, DNS lookup, cookies, IP storage or production mutations occur here. Literal-host checks are not an SSRF defence for future network fetches: DNS can resolve a public hostname to a private address or change over time. Any logo/preview/destination fetch would need an independent server policy. These functions must never be used to justify fetching arbitrary destinations. Caller must still authenticate and authorize brand ownership, reject unknown request fields and persist only approved types. A public destination can redirect again downstream; this module cannot validate its future behavior.

## Verification

`node --test tests/unit/qr-payload.cjs` executes actual production TypeScript through the repository's existing `loadTs` helper. Covers URL/UTM preservation, private/local/encoded hosts, own redirect loops, WiFi/vCard escaping, mail header injection, multibyte capacity and malformed runtime inputs. Full repository typecheck, CI and independent review remain release gates. No browser or physical scanning acceptance is claimed by these pure tests.
