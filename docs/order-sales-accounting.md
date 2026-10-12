# Order sales accounting

Orderfly sales periods and displayed payment dates use `paidAt`, including the
sales dashboard, the customer funnel and sales order views. Order creation time
does not assign revenue to a period or substitute for a missing payment date.
Date ranges use the Europe/Copenhagen calendar day boundaries.

For a paid order, net sales are calculated in integer øre:

```text
max(0, totalAmount × 100 − refundedAmountOre) ÷ 100
```

An absent refund amount is treated as zero. An order with no remaining value is
not counted as a sale. A canceled order contributes zero sales and remains in
the order and cancellation counts. The sales order list shows the net value and
the recorded refund amount.

An operator cancellation requires a 3–500 character comment. The comment is
stored on the order and in the audit log. The detail page displays the comment.
Canceling a paid order removes its amount from sales; issuing a payment refund
remains a separate payment-provider operation, and any recorded refund also
reduces net sales. An expired or definitively failed checkout receives a system
comment when its unpaid order is automatically canceled. An unpaid pickup
cancellation requires an operator comment and releases its discount reservation.

These calculations use existing Orderfly order records only. Missing historical
refund values cannot be inferred from Stripe and require a separate
reconciliation.
