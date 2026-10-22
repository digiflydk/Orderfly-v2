# Atomic unpaid pickup originals (#506)

The actual `createStripeCheckoutSessionAction` pickup acceptance callback prepares
`preparePickupCheckoutAcceptance` and then `prepareUnpaidAcceptanceOriginals` in
one native transaction attempt. Every policy, catalog, routing, manifest, printer,
job and ledger read finishes before acceptance or print writes. Acceptance applies
its Received update and pickupReceived notification; the print plan then checks
that same process-local acceptance capability before creating its canonical
original manifest, routed revision-0 jobs and one ledger delta per printer.
A late error aborts the entire native transaction. Each SDK retry prepares a new
capability against current native state. There is no post-commit job insertion.

The existing #491 service alone issues the opaque capability. The adapter accepts
no caller identity, order projection, timestamps, arbitrary callback or paid flag.
The outbox's fixed unpaid reader reserves exactly two acceptance writes and one
manifest create within the existing shared 500-write budget. Its common internal
planner is reused by the reviewed Stripe adapter; it exposes no arbitrary reader.

`ORDERFLY_PRINT_INTENTS_ENABLED` defaults OFF. OFF skips printer/policy reads and
retains checkout's existing broader tenant ID boundary. An effectively OFF native
policy preserves ordinary unpaid acceptance. ON requires canonical native IDs,
active/trialing brand policy, current target revisions, native product/category
projection and saved rules with complete routing. Paused printers may accept
intent; this grants no dispatch or physical output authority.

A fresh acceptance cannot reuse a manifest or an already-existing selected job.
Already Received and legacy orders cannot mint a capability and are never
backfilled. Staff collection must reuse the canonical originals produced here;
#350/#492/PR497 remain separate and require their own current-main integration
and QA. This does not enable any production flags or change real orders/devices.

## Verification

```
npm run typecheck
node --test tests/unit/printing-unpaid-originals.cjs
node --test tests/unit/printing-unpaid-acceptance-origin.cjs tests/unit/printing-stripe-settlement-integration.cjs
```

The #506 suite exercises actual production modules with one cached module graph
and native I/O isolated: combined acceptance/jobs success, process and policy OFF,
forged/cross-attempt handles, apply ordering, existing-history rejection, stale
scope/revisions, discarded SDK attempts, full queue and late-write/expiry rollback.
A real checkout-action case verifies that its actual callsite uses the adapter.
The shared checkout fixture preserves capability module identity and nested native
paths; its success case is not used as rollback proof. Rollback tests use the
existing atomic memory transaction fixture instead.

Independent current-head review, CI, serialized merge/deploy and relevant live QA
remain required. Neither fixtures nor queued jobs prove physical output. Firmware,
CloudPRNT claim/download/result and controlled first testprint remain separately
tracked pilot requirements.
