# Checkout optional fields (#50)

Runtime logs on 2026-09-07 at 09:49:56 and 09:50:09 reported that Firestore
rejected `paymentDetails.cartDiscountName: undefined` before creating a Stripe
session. The live release was #45; the price validation changes in #47 were not
live. This incident is independent of those changes.

Customer and order writes now omit absent object properties recursively at their
persistence boundaries. This includes absent discount names, pickup addresses,
delivery times and optional product properties. Dates and Firestore SDK objects
remain intact. Null, false, zero and empty strings remain intact. Undefined array
entries still fail explicitly. Global Firestore validation is not disabled.

Local regression: `node --test tests/unit/checkout-session-persistence.cjs`.
The test runs the actual checkout server action with strict Firestore write
doubles and mocked Stripe. It reproduces the exact original nested-field error
with the cleaner disabled, then checks successful order persistence and Stripe
session creation for new and returning customers without discounts and with
automatic, code and newsletter discounts. It also checks preservation of SDK
objects and rejection of undefined array entries. No production orders or real
payments are created by this test.

Work Release must review, merge and deploy the hotfix separately from #47. Work QA
must then verify that these checkout scenarios reach Stripe in the released
build. Local mocked tests are not evidence of live payment success. Carry this
fix into #47 before releasing that feature. Do not mark the incident resolved
until the deployed version and live handoff have been verified.
