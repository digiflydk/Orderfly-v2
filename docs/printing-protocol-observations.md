# Authenticated CloudPRNT protocol observations

`protocol_observation` is private, server-only evidence for a freshly authenticated
native printer operation. It records bounded protocol facts at server time and binds
them to the current brand, location, printer, printer revision and credential revision.

The write flow first issues a 120-second random server nonce. Persistence consumes that
nonce atomically, replaces the current projection with a monotonically numbered revision,
and creates an immutable audit row. Replays, expired challenges, changed scope or
configuration, revoked credentials, malformed legacy rows and invalid server clocks fail
closed. Public read DTOs omit credentials, raw headers, nonce and nonce digest.

Allowed facts are the canonical authenticated MAC and server-issued UID binding,
normalized CloudPRNT client family/version, an optional non-placeholder serial, unique
claimed protocols, advertised encodings/media types, and bounded page geometry. These
are observations, not hardware authority. In particular they do not prove an exact model
variant, firmware, MQTT connection, successful print, paper output, or physical fit.
`dispatchAuthorized`, `capabilityAuthorized` and `physicalCompatibilityVerified` remain
`false`. Missing or legacy evidence remains unknown.

The configuration-write gate remains exact default-off. The module does not create or
remove print jobs, acknowledge a CloudPRNT result, update last-confirmed-use metadata,
change production data, enable output, or modify hardware/Wolt configuration.

The caller owns the actual native transaction and must invoke the operation again on
each SDK retry. The helper passes only the four scope/secret fields to the strict native
verifier; observation fields are not identity input. Its return is a transaction result,
not evidence of commit. A future HTTP adapter must wait for confirmed SDK commit before
returning a nonce or observation. No HTTP endpoint or protocol-payload parser is added.

Raw scope, command, facts and page records are bounded before descriptor traversal.
Stored facts retain the same uniqueness rules as incoming facts. Foreign, malformed or
future-bound prior challenges cannot be silently replaced. Future recorded observations
read as unknown and cannot be overwritten by a backwards server clock. Older valid
observations can be superseded under a freshly authenticated new challenge while their
audit history stays immutable.

Validation runs the production native verifier and credential hashing for the complete
challenge/observation/read chain with only native Admin I/O isolated. Additional tests
cover native revocation and foreign-scope rejection before observation reads, discarded
transaction attempts, commit failure, parser/reflection bounds, expiry, corruption and
clock rejection. Focused parser tests isolate native identity separately. These checks
are software evidence, not emulator acceptance or physical-printer verification.
