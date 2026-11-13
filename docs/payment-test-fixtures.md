# Payment fixture execution

Payment tests execute production TypeScript with only external transport,
identity and persistence replaced by synthetic fixtures. These tests do not
establish actual Stripe/Worldline merchant acceptance or physical printing.

`tests/helpers/load-ts.cjs` caches compiled JavaScript by absolute filename and
exact source text. Each `loadTs` call still evaluates a new module with that
call's mocks and independent opaque handles. A source edit invalidates the
compiled entry; no executed exports or customer/provider state are shared.

`moduleGraph` uses that same compilation cache while retaining its existing
per-graph CommonJS module cache. Within one graph, financial and print capability
WeakMaps keep their required identity. Separate graphs remain independent. The
merchant payment fixture uses a fresh graph per fixture, avoiding repeated server
graph evaluation and retaining native capability identity.

`test-loader-isolation.cjs` verifies independent mocks/handles, unchanged-source
graph identity and source-change invalidation. The historical Stripe lifecycle
fixture now mocks the server-only import sentinel, and the price validation
fixture provides a valid scoped Stripe agreement so valid prices reach customer
validation. Their product assertions remain unchanged.

Run the relevant fixture regressions locally:

```sh
node tests/unit/test-loader-isolation.cjs
node tests/unit/checkout-price-validation.cjs
node tests/unit/stripe-lifecycle-189.cjs
node tests/unit/payment-confirmation-job.cjs
node tests/unit/printing-stripe-transition-proof.cjs
node tests/unit/printing-stripe-settlement-integration.cjs
node tests/unit/worldline-settlement.cjs
```

Report actual completion and case counts. A process stopped by a time limit is
not a passing test, and a mocked provider observation is not a real payment.
