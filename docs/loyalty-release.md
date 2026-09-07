# Internal loyalty (#54)

PO clarified on 2026-09-07 that loyalty is for internal customer understanding.
This release corrects the existing Superadmin score, classification and customer
data. It does not grant financial points or create customer accounts.

## Behaviour

- The customer list, customer details and existing Esmeralda customer-history
  integration use the same `customerMetrics` function. Each uses orders from the
  customer's native brand. Customer metrics use the complete matching order set,
  not the integration's paginated history response.
- Order count, spend and latest purchase are derived on read from paid orders
  with positive remaining value. Pending, cancelled and fully refunded orders
  are excluded. Recorded partial refunds reduce spend in integer ore. Invalid
  monetary records are excluded from the calculation rather than crashing the
  entire customer list. Missing dates receive no recency/frequency credit.
- New customers are visible even without `lastOrderDate`. The list sorts by
  computed latest purchase descending, then stable native customer ID; undated
  customers come last. Customer details show the same score, classification and
  totals; delivery/pickup counts also use qualifying paid orders.
- New admin-created customers must select an existing native brand. Updating a
  customer preserves financial counters and cannot recreate a deleted record.
- Recency means days since the latest qualifying purchase. Frequency is average
  days between dated qualifying purchases, rather than the previous constant.
  Fewer than two dated purchases receive zero frequency points.
- All threshold values are ascending lower bounds. For example, recency defaults
  of 0 / 8 / 31 / 91 days award 100 / 60 / 30 / 0 factor points. The configured
  factor weight applies. Consistent delivery/pickup bonus needs at least two paid
  orders with a known matching delivery method.
- Score is rounded to 0–100. Weights must total 100; thresholds must strictly
  increase; classification ranges must cover 0–100 without gaps or overlap.
  Missing/blank/negative values are rejected. The form shows validation errors
  while preserving entered values. Valid settings can be saved and reopened.
- No qualifying purchases means `New`. Other defaults are At Risk 0–49,
  Occasional 50–79 and Loyal 80–100. A frequent, recent repeat customer can now
  reach Loyal (the focused default example scores 91).
- Invalid legacy settings show a visible warning and validated defaults until
  corrected and saved. Merely opening the page does not rewrite stored settings.

## Data and release boundary

Displayed historical metrics are recalculated from existing order records. This
release does not rewrite stored customer counters, run a backfill or grant credit.
It cannot infer refunds which have never been recorded in Orderfly: those need a
separate Stripe reconciliation. A missing refund field is treated as zero, not
as evidence that Stripe has been reconciled. There is no daily score job; scores
reflect the current date when the internal view is read.

The public storefront, checkout, receipts, Stripe handlers, auth/session code,
App Hosting variables and database rules retain their main-branch implementation.
No reward-specific runtime setup or new customer login is required for this PR.
The removed rewards/financial implementation remains in Git history at
`3085d42acb5690e90aabc2b7fe7825ecc6ec99dd` for reference, not for direct deployment.

Observed permissive financial rules, payment-secret access and related review
findings remain OPEN in [security/payment issue #57](https://github.com/digiflydk/Orderfly-v2/issues/57).
The existing Superadmin authentication work is tracked by #26. This scoring PR
preserves the existing administration boundary; it does not establish or claim
complete platform authorization. Separating that work does not resolve it.

## Focused local verification

```
npm run typecheck
node --test tests/unit/loyalty-internal.cjs
```

Tests execute the production score, settings actions, customer reads and
integration against deterministic in-memory data. They cover paid/pending/
cancelled/refunded orders, dates/frequency, score boundaries, invalid settings,
save/reopen, legacy defaults, sorting, brand separation, new customer identity
and consistency between list/details/integration. They do not prove live Firebase
rules, deployed data quality, browser rendering or a production deployment.
No Actions or full Playwright suite is requested. Commit with `[skip ci]`.

## Work Release and Work QA

Work Release reviews the corrected scope and exact current PR head, then merges
and deploys through the existing release process. Do not deploy the superseded
rewards head or provision its removed runtime variables. Record the active SHA;
merge alone is not deployment.

After deployment, Work QA should:

1. Verify the released SHA and open Superadmin → Loyalty using existing admin
   access. Check the warning on invalid legacy configuration and threshold help.
2. With explicitly marked reversible test configuration, reject invalid weights,
   empty/unordered thresholds and overlapping/gapped ranges. Save valid settings,
   reopen and compare values. Restore the original valid settings after the test.
3. Check a new customer without purchases and existing customers with paid,
   pending and cancelled orders. Compare displayed count, spend, latest purchase
   and classification with the underlying records, including recorded refunds.
4. Confirm newest purchase sorting, customer details and the existing integration
   agree for the same brand/customer, and another brand's orders do not contribute.
5. Confirm the storefront/checkout exposes no customer rewards/login/point balance
   from this PR. Report exact evidence and any missing historical refund data.

No live mutation or deployment is performed by the local verification command.
