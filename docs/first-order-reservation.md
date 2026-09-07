# First-order reservation scope (#62, reservation fix)

## Root cause

The checkout error `First-order promotion already used or reserved` came from a
customer-wide `firstTimeHeld` flag being checked even when the new order had no
first-order promotion. A prior held attempt could therefore stop an undiscounted
order, an order with automatic item discounts, or an ordinary discount code. The
message does not establish that a first-order campaign is currently active.
Disabling a campaign does not invalidate a previously issued Stripe session.

The screenshot is consistent with this code path; its customer's live capacity
record was not read or modified. No personal screenshot details are copied here.

## Corrected behavior

Only a **new first-order promotion reservation** applies the first-order gate.
Such a reservation still rejects existing first-order holds, any other pending
customer holds, and prior paid purchases. Global and per-customer limits for all
discounts remain enforced.

A later ordinary order is allowed, but preserves an earlier `firstTimeHeld` flag.
Canceling or settling that ordinary order cannot clear the earlier offer's hold.
Only settlement/release of the order that owns the first-order reservation clears
that flag, through the existing payment/cancellation rules. No counters are
reset, no pending Stripe session is silently expired and no payment validation is
bypassed by this fix.

This intentionally replaces the old symmetric exclusion policy: a first-order
offer legitimately reserved before an ordinary checkout remains payable if the
ordinary order is paid first. Eligibility was granted when the offer was
reserved; starting/paying another ordinary order does not retroactively revoke
that existing session. Further first-order offers remain blocked by held/paid
capacity. This matches #62's requirement that a purchase without a first-order
promotion must not be blocked by that promotion.

The fix handles existing customer flags without a migration or manual reset.
It does not reconcile orphaned legacy holds for a **future first-order offer**;
that requires verifying the original Stripe outcome. Menu navigation and cart
restoration are separate acceptance items in #62 and are not changed here.

## Focused verification

Based on main `5f515ce09f0ed961bd5772e6049558bff7b91af3` (merged #61).
Before the fix, the new regression produced five failures with the exact reported
message and two passing first-order protections. After the fix, all seven pass.
The existing reservation/limits regression also passes with the new asymmetric
policy explicitly tested. TypeScript passes.

```sh
node --test tests/unit/first-order-reservation.cjs
node --test --test-name-pattern 'reservation serializes' tests/unit/promotion-review.cjs
npm run typecheck
```

The tests execute the production reservation and settlement functions using
atomic in-memory Firestore transactions. No Actions, broad suite, production
writes or real payments were run. The previous symmetric test was updated for the
explicit #62 behavior and now also asserts preservation of the original hold.

## QA handoff

Til **Work QA Orderfly** efter review, merge og deployment:

> Verificér reservation-rettelsen i #62 på den deployede commit. Brug isolerede
> testdata og Stripe-testtilstand. Kopiér ikke rigtige kundeoplysninger til GitHub.
>
> 1. En kunde med en tidligere førstegangsreservation skal kunne åbne Stripe for
>    en ny ordre uden rabatkode og uden tilmelding til nyhedsbrev. Gentag med
>    en almindelig rabatkode, der ikke er begrænset til førstegangskøb.
> 2. Beløbet i Stripe skal svare til checkout, inklusive aktive varerabatter og
>    gebyrer. Ingen førstegangsrabat må tilføjes automatisk af denne rettelse.
> 3. Annullér det almindelige betalingsforsøg. Den tidligere førstegangsreservation
>    skal stadig være beskyttet; en anden førstegangsrabat må ikke reserveres.
> 4. Kontrollér, at to samtidige førstegangstilbud stadig ikke kan reserveres,
>    og at tidligere betalte køb fortsat afviser et nyt førstegangstilbud.
> 5. Afprøv grænsen på en almindelig begrænset rabatkode; den må ikke overskrides.
> 6. Dokumentér commit, testordrer, forventet/faktisk resultat og sikker oprydning.
>    Eksisterende sessioner må kun frigives efter bekræftet Stripe-annullering
>    eller udløb. Markér øvrige menu-/kurvkrav i #62 separat.

Local results are not deployment or live payment evidence. Work Release handles
review, merge and deployment; the issue remains open until its separate live
acceptance items are verified.
