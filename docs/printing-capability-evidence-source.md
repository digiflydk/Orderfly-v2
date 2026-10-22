# HTTP pilot capability evidence: source decision

Decision checkpoint: 2026-10-22. Repository baseline: `88587bedba3ac42908b272e66d977ebfdd9c63c4`.
Scope: #485 source/contract decision, with #486 observations and #461 delivery as dependent work.

**Implementation status: BLOCKED_SOURCE.** No authoritative evidence for either Esmeralda device was available through the authorized repository/issue access used for this decision. The official documentation establishes ways to collect facts; it does not verify these installed printers or provide a remotely verifiable hardware attestation. Do not implement an evidence producer that simply promotes configuration, an uploaded image, or an authenticated CloudPRNT poll into authority.

## Available facts and missing authority

| Candidate | What official documentation supports | Decision |
| --- | --- | --- |
| CloudPRNT client actions [S1] | `ClientType` identifies the family; `ClientVersion` identifies the CloudPRNT implementation version. `GetConfig` is unavailable for mC-Print2/3. | Insufficient for exact variant/installed firmware. #486 may preserve observations only. |
| CloudPRNT request headers [S2] | Optional family/version, media, geometry, identity and token fields; mC-Print2/3 headers require firmware 3.2 or later. | Device claims, not independent authority. Missing headers are not proof of unsupported hardware. |
| StarIO `getFirmwareInformation()` [S3] | Model-name and firmware-version query, supported for mC-Print2/3. | Concrete candidate for controlled local collection. No connected collector/session or captured result is available here. The documented model-name field does not establish that every exact SKU suffix is returned. |
| Manufacturer label [S4, S5] | Exact model identification and serial on the bottom label. | Candidate for operator qualification and comparison with a local query. No label evidence is supplied. |
| Printer self-print [S6, S7] | Installed firmware appears on the first information page; interface/settings information is also printed. | Candidate supplementary evidence, not performed. Produces physical output and the documented button procedure involves power-off. Requires a separately scheduled hardware window that preserves Wolt. |

No SDK is run, no LAN address probed, no credential extracted, and no hardware/configuration/output change is made by this decision. A local SDK connection may itself contend with another printer client; it is not assumed safe on an active Wolt device. A normal CloudPRNT server authenticates to/from its enrolled device; possession of that credential does not attest model, firmware or paper fit.

## Current code boundary

- `configuration.ts` accepts a pretrusted `self-test`/`device-query` DTO. Its pure HTTP compatibility minimum is 1.2. It has no authoritative source, lifetime or current credential-revision validation.
- `cloudprnt-http.ts` explicitly selects the token-capable mC-Print2/3 subset with firmware **at least 3.2**. The effective token-based pilot requirement must therefore be at least 3.2; passing the older pure helper is insufficient. This document does not change either helper.
- `device-auth-native.ts` returns capability/dispatch/physical-compatibility authority as false. `native-claim.ts` reserves only and also returns no dispatch grant. `print-result-native.ts` remains internal and depends on a real immutable delivery producer.
- `writes.ts` and `lifecycle.ts` delete `locations/{locationId}/printerCapabilityVerifications/{printerId}` on their relevant mutations. `device-credentials-service.ts` increments credential revisions on rotation/revocation without deleting that path. Consumers must compare fresh revisions; physical record deletion alone cannot enforce invalidation.
- `kitchen-png.ts` emits 384 dots for 58 mm or 576 dots for 80 mm and explicitly reports `physicalFitVerified: false`. Model family or paper-width configuration cannot certify that raster's physical fit.

## Proposed admission contract — contingent, not an implemented grant

The following is a reviewable contract for a future qualified evidence source. It is **not authorization to create records**, and no existing service currently satisfies its producer requirements.

1. A server creates a single-use qualification session for one authorized superadmin, one native brand/location/printer, and the current printer and credential revisions. The server chooses an unpredictable session ID and a ten-minute expiry. Client clocks are never authoritative.
2. A controlled collector or supervised hardware session obtains the exact label/SKU, installed firmware, interface, and effective paper/print geometry from the same physically identified device. Store the query method/library version, bounded raw result or protected artifact reference, and its digest. Correlate the native enrollment with that physical device using a reviewed procedure. MAC/serial/UID equality is supporting correlation, never the proof by itself.
3. A server verifier validates collector/operator authorization, session provenance, single-use freshness, scope, current native records, exact revisions, normalized model/SKU/firmware, and the explicit HTTP output profile. A browser form or untrusted collector self-signature is insufficient. The authenticated collector channel and physical-to-enrollment binding must first be demonstrated with a real device; these are the missing source decisions.
4. Accept only mC-Print2/3, HTTP with token support and verified firmware >=3.2, a reviewed exact variant, `image/png`, and an explicit raster/paper/resolution profile. Keep mC-Print2 limited to 58 mm; mC-Print3 58/80 mm needs the actual installed guide/profile qualified. MQTT remains out of scope. Require bounded geometry compatible with the emitted raster; do not derive a permit from an advertised width alone. Physical fit and successful receipt printing remain separate later acceptance tests.
5. Atomically consume the qualification session, append immutable audit, and write a versioned private evidence record. Bind `evidenceId`, schema/policy version, brand/location/printer, printerRevision, credentialRevision, exact SKU, firmware, transport, output profile/digest, provenance references, verifier identity, server `issuedAt` and `expiresAt`, and revocation state. Never persist raw credentials in evidence or audit. Reject unknown schema keys/versions and incomplete provenance.

Proposed pilot lifetime: **one hour maximum from server issue**, with exclusive expiry (`now < expiresAt`), no sliding renewal and no renewal from polling. Qualification sessions last ten minutes as above. These are conservative proposed Orderfly policy limits, not Star guarantees or proof that firmware cannot change within an hour. They require review before implementation; changing them requires a new policy version and requalification.

Every future admission, reservation/delivery operation and retry must freshly read the native location/printer/credential, revocation record and evidence in the operation's transaction. Require exact scope and current revisions, active/eligible state, valid provenance/policy, server time within lifetime, supported profile, and all independent default-off output gates. Evidence never bypasses queue-age review, job ownership, immutable delivery, operation authentication or terminal replay protection. No permission derived in one request may be reused as an opaque grant in another.

Invalidate immediately on config/lifecycle/credential revision mismatch, credential revoke, explicit evidence revocation, device replacement, reported firmware/interface/paper change, or unsupported policy. Firmware changes outside Orderfly cannot be detected by current revisions: if continuous trusted detection cannot be established, requalification must be required before the next controlled pilot session, and unattended production remains blocked. Missing/stale/contradictory evidence, unavailable verifier/storage, clock anomaly or transaction conflict returns a bounded pending/denied result and retries only under a fresh operation. It must not release bytes, remove a queue item, confirm a result, update last-used, or silently fall back to tokenless HTTP.

Raw label photos, full serial/MAC values, IPs and collector artifacts stay in private, access-controlled storage with an explicit retention policy agreed before collection. Public issues/PRs contain only status and nonsecret evidence IDs. Record the server-side auditor, outcome and revision references; avoid customer/order payloads entirely. Deleting or redacting an artifact must invalidate dependent evidence rather than leave an unverifiable grant.

## Smallest safe next step and estimates

The coordinator must arrange a controlled qualification handoff for **one** printer with an operator who can identify the device and preserve Wolt. Needed inputs are exact label/SKU and serial, currently installed firmware from a trusted local query (or supervised self-print in an authorized output window), installed media/guide and geometry, native enrollment scope/revisions, and a demonstrated authenticated provenance channel tying these to the same device. An existing self-print artifact may be inspected without initiating a new print, but its age and chain of custody still need verification. Do not send secrets or raw identity artifacts to GitHub.

| Follow-up slice | Active effort | Readiness / exit evidence |
| --- | --- | --- |
| One-device source/provenance qualification and contract review | 0.5–1 sprint, plus separately scheduled hardware/operator wait | Actual bounded query/artifact, exact variant resolution, physical-to-enrollment binding and trusted channel reviewed. Failure leaves BLOCKED_SOURCE with the precise gap. |
| Strict native schema, qualified producer, audit/revocation and negative tests | 0.75–1 sprint | Conditional on verified source and accepted policy; reject forged/replayed/cross-scope/stale-revision evidence. |
| Native capability/output-policy consumer and transactional failure tests | 0.5–0.75 sprint | Conditional on producer; revision/expiry/revoke checks on every retry, all output gates default off. |
| #461 queue/outbox-to-delivery ownership and replay identity | 0.6–1 sprint | Conditional on admitted capability contract; no duplicate enqueue after terminal transfer. |
| #461 authenticated CloudPRNT delivery/result operations | 0.6–1 sprint | Conditional on ownership contract; token/revision/failure/result tests and independent review. |

One sprint is 60 minutes of active effort. These are conditional estimates, not a four-hour elapsed-time promise. CI/review/deploy and operator waiting are separate. The two #461 slices can be refined once their prerequisites exist. Browser QA cannot manufacture missing hardware facts. Physical acceptance, controlled activation, and Wolt coexistence still require their own authorized pilot plan after software delivery. #485 and full #456/#461 must remain open at this checkpoint.

## Verified primary sources

Read 2026-10-22; no vendor attestation claim is inferred from these manuals.

- [S1: CloudPRNT client actions](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/client-action.html)
- [S2: CloudPRNT client request headers](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/client-http-request-header/index.html)
- [S3: StarPRNT Android StarIOPort, getFirmwareInformation and support matrix](https://star-m.jp/products/s_print/sdk/starprnt_sdk/manual/android_java/en/api_stario_port.html)
- [S4: mC-Print2 model/serial label](https://www.star-m.jp/products/s_print/mcprint2/manual/en/troubleshooting/cannotSolve.htm)
- [S5: mC-Print3 model/serial label](https://www.star-m.jp/products/s_print/mcprint3/manual/en/troubleshooting/cannotSolve.htm)
- [S6: mC-Print2 self-print information](https://www.star-m.jp/products/s_print/mcprint2/manual/en/basicOperations/testPrint.htm)
- [S7: mC-Print3 self-print information](https://www.star-m.jp/products/s_print/mcprint3/manual/en/basicOperations/testPrint.htm)
