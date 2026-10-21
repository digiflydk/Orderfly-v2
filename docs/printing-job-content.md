# Immutable synthetic testbon content (#355)

`src/lib/printing/job-content.ts` is a server-only content contract for an explicit
synthetic receipt. It reuses the existing kitchen PNG encoder and Danish glyphs.
It accepts no order, customer, credential, receipt-text or command input. Fixed
visible text marks the receipt as a test and says no food should be produced.

`createSyntheticTestBonContent(binding)` validates brand/location/printer IDs,
positive safe printer revision, Star model and paper width. Its frozen envelope
binds schema version 1, synthetic purpose, `orderfly-testbon-v1` content version,
`orderfly-kitchen-png-v1` encoder version, exact target/profile, raster dimensions,
font, byte length, SHA256 of the exact PNG bytes and canonical base64 content.
The envelope and its nested binding/raster objects are frozen; strings hold the
payload so a caller cannot mutate a retained Buffer. 58/80 mm produce 384/576-dot
PNG; mC-Print2 is restricted to 58 mm. Physical fit remains explicitly unverified.

`readSyntheticTestBonContent(envelope, expectedBinding)` snapshots bounded own data
properties before validation and rejects getters, exotic objects, extra/private
fields, invalid versions, scope/revision/profile mismatches, invalid lengths,
noncanonical base64 and corrupt digests. It also regenerates this version's fixed
synthetic PNG and verifies exact content/raster equality: an attacker recomputing
a digest over arbitrary substituted PNG content does not pass. Every successful
read returns its own Buffer, so modifying one result cannot change later reads.
Maximum payload size and raster height reuse the existing encoder limits.

This is **content consistency, not native scope or output authority**. Expected
binding must later come from authenticated, authorized current native records.
Caller-supplied matching IDs/revisions prove neither ownership nor device identity.
The return explicitly has `dispatchAuthorized: false`. There is no persistence,
real-order projection, endpoint, device authentication, claim/download/ack, queue
state transition, activation, testprint request or production import in this slice.
Nothing enables configuration, intent or physical output flags.

Validation: `npm run typecheck` and `node --test
tests/unit/printing-job-content.cjs tests/unit/printing-kitchen-png.cjs
tests/unit/printing-receipts.cjs tests/unit/printing-cloudprnt.cjs`. The production
module runs with only the `server-only` import marker isolated; PNG decoding uses
real Sharp. The existing CI workflow adds one root-authorized three-line dedicated
test step immediately after Kitchen PNG payload regression; all other workflow
content and permissions remain unchanged. Tests cover both widths/models, Danish text, immutability/copying,
serialization/readback, every binding/version/profile field, hostile/oversized
input and content substitution even with a recomputed digest. No browser flow
changes; CI/review/deployment and applicable release QA remain separate gates.

Before a controlled single-printer pilot, private device credential provisioning,
durable claim/token/lease/download/result handling and compatible queue/history
ledger semantics are still required, followed by superadmin-only controlled
activation/testbon. Existing #344 owns authoritative activation/confirmed-use
metadata. Automatic order printing needs separate native intent-policy activation
and order integration; it is not required to prepare a synthetic test receipt.
Authenticated live acceptance and actual paper/Danish glyph/width/cut/recovery/Wolt
coexistence tests remain outstanding. Simulator or valid PNG is not physical proof.
