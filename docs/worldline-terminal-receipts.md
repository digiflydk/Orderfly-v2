# Worldline return and terminal receipts

A normal hosted return produces no intermediate HTML. Its private native receipt
capability, original agreement, transaction ID, merchant, currency and amount are
validated before financial completion. Only fully captured, uncredited native
Paid qualifies as successful checkout. Callback completion retains this strict
Paid-only rule.

A recorded refund or confirmed authorization cancellation is a different final
outcome. The return route checks native terminal accounting and the same pinned
transaction server to server: full captured/exact native credited amount for a refund, or deleted
with zero captured/credited for a void. It rereads the native scope and terminal
facts after provider I/O, then redirects to the canonical private receipt. It
never captures, refunds or cancels merely to display that outcome. Partial refunds have their own amount-bearing final display. Unknown, mismatched
or locked outcomes cannot masquerade as a completed full
refund or approved checkout.

The guest projection exposes only server-derived `paymentOutcome` display state.
The receipt shows refund/cancellation rather than “Tak for din bestilling!”. A
fully or partially refunded or canceled outcome does not emit a purchase conversion or celebrate a
loyalty stamp. Partial receipts show the credited and remaining amounts without inferring order
cancellation. Original invoice/accounting records remain unchanged. This display
projection does not itself authorize settlement or a money operation.

If the bounded return cannot determine a final result, its exception-only 503 page
explains the uncertainty and offers a link to inspect the same payment. The link
contains validated original proof fields only, strips card/hash/provider return
parameters and never points to checkout creation. Errors expose fixed support
codes, not provider messages or keys.

Worldline controls the separate-origin hosted page. Its inspected public frontend
(version 6.47.1) hides normal success content for immediate redirect and schedules
a redirect loader after one second. No documented Checkout API option controls
that internal timer. Orderfly cannot guarantee that Worldline never briefly
repaints blank; switching to an extra success page or inventing an API flag is not
a fix. Actual iOS rendering and provider-side behavior need separate observation.

Local validation includes callback-success regression, terminal return rejection
and outcome tests, and desktop/mobile Chromium receipt tests. It is not proof of
an actual merchant refund, physical printer output or Safari acceptance.
