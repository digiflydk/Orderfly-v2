# Supervised single-device pilot qualification

Issue #510, child of #485; coordinator #309. This is the first bounded prerequisite
for a synthetic testbon, independent of customer-order settlement and routing.

`issuePilotQualificationSession` is server-only. It requires the existing platform
superadmin session before input inspection and the existing configuration-write
gate, which stays off by default. Every SDK transaction attempt rereads native
platform superuser and catalog-edit authority, native brand/location ownership,
canonical printer configuration and exact current nonrevoked credential revision.
The printer may remain disabled: issuing a qualification must not activate it.

The service creates `locations/{locationId}/printers/{printerId}/pilotQualifications/{sessionId}`
and immutable sibling `pilotQualificationAudit/{sessionId}` atomically. Session ID
and nonce each use 256-bit server entropy generated once outside retries. Only a
scope/revision/session-bound nonce digest is persisted. The nonce is returned as a
nonenumerable property only after commit succeeds. Unknown commit returns a fixed
error and no nonce; there is no nonce recovery. Abandoned pending records expire
after ten server minutes and cannot grant authority. This slice adds no cleanup
worker or production writes.

The strict session state is `pending_operator_attestation`, and its trust label is
`supervised_operator`. All output, dispatch, activation and physical-compatibility
fields remain false. This is neither manufacturer attestation nor an implemented
production capability grant. No previous successful print is required: physical
fit is measured by the upcoming first controlled synthetic print.

## Upcoming controlled consumption

`pilotOperatorAttestationSchema` and `validatePilotOperatorAttestation` define the
next consumer's input boundary: same native scope/revisions/session, matching nonce,
exclusive server expiry, operator identity, affirmative physical identification and
native-enrollment correlation, protected capture digest, local StarIO query method,
model/SKU/installed firmware, and consistent PNG raster/paper profile. The current
token-dependent mC-Print2/3 subset requires firmware 3.2 or later. A model family,
CloudPRNT implementation version or authenticated polling alone is insufficient.
Raw label/serial/IP/captures never enter this input or public issues.

The validator is pure and returns no output permission. A future controlled
consumer must require the currently authenticated authorized supervisor, verify
the accountable operator and protected capture/provenance, freshly reread native
authority/configuration/credential revisions and match model/media to that printer,
then atomically consume the still-pending session exactly once while binding one
immutable noncustomer synthetic job. A validated object is not a transferable
authorization token. No caller may persist an attested state or dispatch from this
pure return. Replays, revision changes, expiry, failed provenance or uncertain
commit must fail closed. Do not automatically resend after uncertain delivery.

That consumer, authenticated HTTP delivery/result operations, pilot UI/API,
controlled actual provisioning/activation, hardware collection and print window
are not delivered here. Full-order queue ownership/terminal replay remains #461.
No configuration, output flag, real order, physical device or Wolt change is made.

## Sources and verification

Star's [HTTP operating table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html)
lists mC-Print2/3 general HTTP support from firmware 1.2. The
[job GET reference](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-request-get/get-request.html)
requires 3.2 for their job tokens. The
[StarIOPort reference](https://star-m.jp/products/s_print/sdk/starprnt_sdk/manual/android_java/en/api_stario_port.html)
documents `getFirmwareInformation` returning model and installed firmware without
requiring a print. The local query still requires a Wolt-safe operator window;
opening a device connection is not assumed harmless during another client's work.

Run `npm run typecheck` and
`node --test tests/unit/printing-pilot-qualification.cjs`.
Tests execute the actual service and existing policy/configuration/credential
schemas with only session/Admin I/O replaced. They cover pending issuance,
auth-first and gate/strict-input rejection, native scope/revision/revocation,
retry reauthorization, rollback/unknown commit, nonce absence from persistence,
and the future consumer's strict nonce/session/revision/profile/expiry boundary.
