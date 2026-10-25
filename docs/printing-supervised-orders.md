# Supervised real-purchase CloudPRNT tests (#549)

> Historical supervised test flow. Issue #613 adds a separate persistent brand
> setting under **Print indstillinger → Automatisk print**. See
> [brand automatic printing](printing-automatic-print.md). An explicit saved OFF
> overrides this legacy test policy; saved ON does not use its 60-minute window.

The ordinary `/api/cloudprnt/{brand}/{location}/{printer}` endpoint can deliver
original kitchen jobs during an explicitly opened supervised order-test window.
This is not unattended production capability and does not close #485's hardware
source requirement. Physical setup and successful paper inspection remain live
acceptance work. Runtime flags are enabled by activation #560; see [activation and rollback](printing-supervised-order-test.md#server-configuration-and-effects). Deployment does not create qualification, routing or test-window records.

## Preparation and scope

The supervisor first clicks **Print testbon** on the connected printer, checks its physical
paper and confirms that the same device, firmware and media remain installed.
The order-test control binds a limited window to the exact printer/credential
revisions and qualification. Saved routing must include the selected printer.
The first test purchase must contain ordinary product items, not combo menus:
the existing native routing projection cannot render combos. A supervised policy
therefore skips all printing for a purchase containing combos, including mixed
orders, while preserving normal checkout/payment acceptance. It never emits a
partial ticket. Generic non-pilot policies keep their existing rejection rules.
This slice prints kitchen jobs only.

Required separately controlled flags are
`ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=true`,
`ORDERFLY_PRINT_INTENTS_ENABLED=true`, and
`ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED=true`.
The synthetic test separately uses `ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED=true`.
The ordinary endpoint and synthetic endpoint are distinct printer URLs. Existing
ordinary POST behavior remains authenticated, read-only `jobReady:false` while
the new order-test flag is off. HEAD explicitly returns 405 and cannot consume a
GET. HTTP never accepts caller scope, success booleans, timestamps or content.

## Purchase and immutable content

Existing trusted Stripe settlement and unpaid-pickup acceptance create original
print jobs and their original manifest atomically with their order transition.
The manifest's catalog digest binds the native saved product selections and
target line IDs. Offering reprojects those native records and requires that digest,
the target revision and configuration digest to match. Current catalog changes,
missing manifests, unsupported characters or oversized instructions fail closed.
No browser-supplied order or arbitrary image is accepted.

At offer, the server renders the selected saved product names, quantities,
literal toppings/removals, saved fulfillment label and bounded order-level
`customerDetails.deliveryInstructions` into a deterministic 384/576-dot PNG.
Removal text such as `Uden løg` does not receive an addition sign. The exact PNG
bytes/digest are frozen in the private offered dispatch. No customer contact or
payment information is copied. A subsequent order cancellation blocks download.
The printer may offer only jobs created within the same window, no older than
five minutes, with enough window time for a 60-second operation lease.

## Protocol and transaction invariants

Every POST, GET and DELETE attempt, including Firestore retries, authenticates
the current native device and rechecks the current window, scope and revisions.
POST reuses the native claim producer and commits an immutable offered dispatch,
hashed token index and one current pointer before returning a server-generated
token. Tokens/credentials are never saved as plaintext. Busy/progress polls do
not offer. A lost offer is not renewed or blindly resent.

GET validates the exact token, claim, content, original queue and eligible order.
One transaction creates the delivered envelope and durable
`originalPrintHistory/{jobId}`, removes only that pending job, advances queue
revision/count/oldest metadata and records `download_started`. Before bytes can
leave the process, a previous `never` usage state becomes `unknown`. A failed or
unknown transaction cannot return bytes. A second GET is rejected, including
when the first response was lost. This conservative behavior requires operator
investigation rather than risking a duplicate kitchen ticket.

DELETE accepts only the existing exact `200`/`OK` aliases as confirmation. The
native result service validates the server-owned claim/delivery, terminal
history, content digest, revisions and lease before atomically recording a result
and confirmed-use metadata. An exact duplicate preserves its first timestamp.
The ordinary protocol provides its delivery token; the independent claim digest
comes from the native offered dispatch, never from a client field. Other codes
record failure/unknown, retain the pointer and do not allow automatic retry or
continued unattended dispatch. Expired or lost acknowledgements remain unknown.

The outbox checks the strict terminal original identity as well as pending jobs,
so payment replay or staff pickup settlement cannot enqueue a transferred job
again. Terminal records never enter the queued-only jobs collection. A corrupt
terminal record or simultaneous pending/terminal identity blocks the transaction.

## Validation

Run `npm run typecheck` and
`node --test tests/unit/printing-ordinary-native.cjs` plus existing native claim,
outbox, result, Stripe settlement, pickup settlement, unpaid acceptance, PNG and
CloudPRNT route regressions. Integrated tests use actual native authentication,
scoped window policy, manifest/catalog validation, encoder, claim producer,
queue transfer, result writer and outbox replay protection with only database I/O
isolated. They are software evidence, not physical printer acceptance.
