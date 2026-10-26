# Native Wolt binding and private quote storage

Shared owner #657; consumes Wolt facade #704 at `174cd5416e4a29badd73523e3107daf5f9c60bc9`.

`integrations/wolt-binding.ts` implements native Firestore reads, immutable private quote writes and Google Secret Manager resolution. It does not activate production or create a courier.

## Canonical private binding

`deliveryProviderBindings/{sha256(JSON.stringify([brandId,locationId,"wolt",environment]))}` holds exactly schemaVersion=1, brandId, locationId, provider=wolt, environment=sandbox|production, active boolean, positive integer revision, merchantId, venueId and a pinned Secret Manager version reference. The secret name prefix includes `orderfly-wolt-<environment>-`; plaintext credentials, latest-version aliases and arbitrary URLs are rejected. Binding provisioning/activation is separate from this runtime reader and must preserve revision/CAS and superadmin authority. No binding is seeded automatically.

The facade projection uses string revision as required by #704. Native location authorization and ownership are checked before binding lookup. Bindings must remain active and match the runtime environment and exact scope. Secret resolution checks the exact reference, environment and merchant against current binding before access and revalidates the complete binding after secret retrieval. Resolver errors are sanitized. No credential is returned through a browser action or logged. Callback signing credentials are separate and must not use the merchant API secret.

## Authority

`createAuthorizedWoltStorage(scope,environment)` uses the verified operator session and native transactional `orderfly.catalog:view` checks for safe configuration/quote operations. It does not grant create permission.

`createClaimedWoltStorage(capability,environment)` uses the dispatcher's fixed `inspectWoltDispatchCapability` and `authorizeWoltDispatchInTransaction` accessors. An ordinary object or caller boolean cannot mint authority. The capability environment must equal runtime environment. Every binding/quote/secret read rechecks current native claim authority. The dispatcher owns capability minting, consumption and expiration; importing this adapter does not supply them.

## Private quote

`deliveryPrivateWoltQuotes/{sha256(JSON.stringify([brandId,locationId,"wolt",environment,nativeQuoteRef]))}` stores schemaVersion=1, strictly validated private quote and derived expiresAtMs. Opaque native references never become Firestore path segments. Quote scope/account/venue/revision must match current binding. Lifetime is at most five minutes from native fetchedAt and never beyond native validUntil; future fetchedAt and expired values are rejected on write and read. Same immutable quote replay is a no-op; changed content under the same reference is rejected. Deactivation/revision change invalidates quotes without editing history.

Private provider promise data is distinct from the shared customer quote. The latter includes authoritative route and item economics; the former contains native promise/dropoff data required to reproduce Wolt create. Both must match before dispatch. TTL cleanup is operational housekeeping, not an access or expiry control.

## Validation

Internal tests exercise real native permission-policy logic with isolated Firestore I/O: wrong environment/scope, revoked access, deactivation, private quote immutability and revision invalidation, forged dispatch capability, expiry/future time, rejected plaintext reference and secret rotation during external await. No production data, real secret or courier call is used. Live credentials and native dispatcher integration require separate acceptance.

## Initial merchant subscription restriction

Version 1 supports exactly one native location and Wolt venue per merchant/environment, with one canonical webhook callback. This is enforced by the server-owned `deliveryWoltMerchants/{sha256(JSON.stringify(['wolt', environment, merchantId]))}` registry, whose strict record is `{version:1, environment, merchantId, brandId, locationId, venueId, callbackId, active:true}`. `callbackId` is the 64-character lowercase SHA-256 identifier of the callback key, not the callback secret.

Every binding lookup must match the active canonical merchant record's environment, merchant, brand, location and venue. A second active location binding for the same merchant cannot quote or dispatch, even if its location record and credentials are otherwise valid. Callback intake must additionally match the registry's exact callback ID. Missing, malformed, inactive or mismatched registries fail closed. Supporting several venues later requires an explicit merchant-level subscription and routing design; adding per-location callbacks is not supported.

The transaction helper `loadWoltMerchantInTransaction(tx, environment, merchantId)` is private server plumbing; callers establish operator, worker or verified callback authority. This change does not provision or alter any production binding, merchant registry, secret or provider subscription.
