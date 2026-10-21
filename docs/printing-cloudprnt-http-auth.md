# CloudPRNT Basic header adapter (#370, T1)

`verifyCloudPrntHttpDevice` is a server-only bridge from one Authorization header
to the existing native identity verifier (#359). The parser is internal and never
returns a plaintext/header DTO. Parsing is not authentication. The trusted caller
must supply its current `NativeTransactionContext` and invoke this function inside
every operation and every SDK retry; no credential or identity cache is kept.

The fixed public username is `orderfly`. The password is the existing server-issued
32-byte random secret encoded as exactly 43 canonical base64url characters (#356).
Username/password are case-sensitive. The Basic scheme is case-insensitive, with
one or more ASCII spaces between scheme and token. The raw header is bounded at
256 characters before regex/Base64 work; bounded scope IDs are checked before
native I/O. Credentials therefore encode to exactly 52 ASCII bytes/72 canonical
Base64 characters with `==`. Combined/duplicate representations, control or
non-ASCII bytes, accessors, extra fields, noncanonical padding and malformed
secrets reject before Admin/native reads. Byte checks precede UTF-8 conversion,
preventing high-bit aliases from lossy ASCII conversion.

Only a successful call to the REAL `verifyNativePrinterDevice` grants the existing
immutable current-attempt identity metadata. Its native brand/location/printer
and current private credential reads retain scope, revision, rotation, revocation,
deletion and canonical brand-lifecycle checks. Neither a fixed username nor URL
scope, MAC, UID or previous snapshot is authority. Disabled/paused/active identity
onboarding remains allowed; `dispatchAuthorized`, `capabilityAuthorized` and
`physicalCompatibilityVerified` are always false. Every operation must separately
enforce current capability, lifecycle and controlled output policy.

Errors expose only `invalid_cloudprnt_authorization`, `device_unverified` or
`device_unavailable`, with fixed messages and no cause/raw provider/native text.
There is no logging, credential cache, provisioning, endpoint, queue mutation,
poll/claim/download/ack, testprint, TLS enforcement or hardware call in this slice.
The future HTTPS endpoint must reject unsupported request/transport conditions
and handle duplicate raw Authorization fields at its own HTTP boundary. This
adapter rejects arrays and combined values; an upstream component that silently
discards duplicates cannot be detected from an already selected single string.

Primary references inspected21 October 2026:

- [RFC 7617](https://www.rfc-editor.org/rfc/rfc7617.html), section 2: Base64 user/pass
  with colon separator, case-insensitive scheme and forbidden control characters.
- [Star CloudPRNT security](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/security/index.html):
  optional Basic authentication, and TLS to protect exposed credentials.
- [Star client settings](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/client.html)
  and [HTTP settings response](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-info-get/get-response.html):
  configured Basic username/password, maximum 63 characters. The chosen 8/43
  character values fit these limits; actual model/firmware/TLS support is unverified.

Run `npm run typecheck` and:

```sh
node --test tests/unit/printing-cloudprnt-http-auth.cjs tests/unit/printing-device-auth-native.cjs tests/unit/printing-device-auth.cjs tests/unit/printing-identity.cjs tests/unit/printing-domain.cjs
```

Tests execute the actual adapter, native verifier and real crypto with only Admin
I/O isolated. They cover exact native paths/no writes, canonical header/byte/input
bounds, no native work for malformed input, wrong secret, scope/revision/status,
rotation/revoke/reused SDK transaction, no secret in results/errors and all authority
flags false. Simulator/helper success is not a device HTTP or physical-print test.

This is ONE planned bounded T1 development task: nominal 30 active minutes,
range 20–45, actual active effort unmeasured. Implementation and live acceptance
are separate. Release depends on #359/PR360 actually reaching main, genuine fresh
main sync, own checks, current-head CI and completed independent Codex review,
then root-only serialized release and applicable live QA. Config/intent/output
flags remain OFF; no production data/secrets/env/rules/index/firmware/Wolt changes.

P1 dependency correction: the canonical #359 verifier now validates brand/location
authority before constructing or reading private printer paths. This branch
genuinely merges that original fix; it does not duplicate or edit the verifier.
Two actual-adapter regressions first failed on the old dependency (private read
frontier and private provider failure influencing rejection), then passed after
canonical propagation. Successful four-path and rotation/revocation checks remain;
negative scope read counts are tightened to brand/location only with explicit
path assertions. No private printer metadata or credential/provider error is read
or exposed for a rejected foreign tenant.
