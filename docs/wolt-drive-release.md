# Wolt Drive release handoff

Coordination: #657. Wolt epic: #672. Release preparation: #693. Live acceptance: #694.

## Current boundary

The Wolt adapter is preparation for the shared Levering module. Do not activate it merely because its isolated tests pass. The delivery coordinator owns shared storage, checkout/payment, route mounting, serial merge and deployment. Marketplace is excluded.

Reviewed component PRs: #696 discovery/contract documentation, #697 server configuration/binding, #698 signed webhooks, #699 health/diagnostics, #700 HTTP and quotes, #702 booking/cancellation, #703 sandbox quote runner. #704 composes the provider facade and requires the accepted shared TypeScript contract and native components. Read each current head and review evidence from #692; an old review cannot approve a changed head. #703 is stacked on the quote branch and must be retargeted safely when its dependency merges.

The normative shared contract is accepted at commit 04f9a512247ae03be0b855ef36ab753e57203c10, provider-contract.ts blob d2da8a2ec58375463aaa8b39957b5d95b6c3cab2. Exact release SHA is deliberately not declared: no merged Wolt release exists yet.

## Runtime integration gates

1. The shared owner implements authenticated active environment-scoped merchant/venue binding and secret resolution. Browser provider IDs never select secrets. Do not copy test credentials to production configuration.
2. Persist the private native quote with authoritative scope, binding revision, request fingerprint, cost and expiry. Returned Wolt dropoff coordinates must be reused. Provider cost is not customer delivery price; route distance remains null until a real routing source supplies it.
3. Shared orchestration reserves and marks a unique durable attempt before create, outside datastore transaction callbacks. The facade's claim hook must verify an actual claimed attempt; a stub returning true is forbidden in production. Unknown outcomes require reconciliation, never a new random reference.
4. Persist both providerDeliveryId and wolt_order_reference_id before resolving webhook/cancellation identities. Handle early events without acknowledging them before durable retention. Resolve the actual authorized attempt before cancellation and preserve explicit operator reason.
5. Mount the existing Request-to-Response webhook handler only with opaque callback mapping, independently provisioned webhook secret, active merchant/venue recheck and durable inbox. Authenticity is not sufficient without tenant/attempt ownership. Acknowledge after durable acceptance; unknown mappings/storage failures remain retryable. ETA-only events must not fabricate lifecycle progress.
6. Preserve payment/kitchen/delivery state separation. Full checkout compensation, customer tracking and original print integration remain shared delivery tasks. Initial pickup ETA is preliminary; verified pickup_eta_updated supplies reliable timing.

## Evidence and unpassed acceptance

Internal component tests/typechecks and exact-head independent reviews are recorded on the PRs and #692. A combined test tree must record all dependency SHAs and the exact shared contract overlay; it is not a proof that current main includes those dependencies.

Genuine sandbox quote QA has succeeded through the adapter for ASAP and scheduled delivery. The optional runner in #703 loads credentials from an external private file and prints sanitized results. No credentials belong in repository files, comments or application logs.

Still required: approved test recipient data for create/cancel, reachable sandbox callback and signing configuration, genuine creation/cancellation/event lifecycle, integrated browser checkout/payment/recovery/accessibility tests, and any required physical receipt/device or courier pilot. No real booking or full lifecycle PASS is inferred from a quote. Paid production pilot requires separate authorization. Missing access remains an open issue, not a synthetic PASS.

## Serial release procedure

- Re-read #657 and all current review/hold messages; confirm release ownership before merging.
- Integrate current main plus the accepted shared module and reviewed Wolt dependencies. Resolve overlaps with the shared owner. Re-run relevant internal checks on the final assembled commit: typecheck, focused adapter/contract tests, required browser tests and production build. No GitHub Actions testing/deployment.
- Independent Codex review must cover the exact assembled head. Resolve all findings. Repository protections must not be bypassed; document a conflict if an unavailable gate is enforced.
- Keep dispatch disabled until complete integrated acceptance, approved prices/routing and production merchant onboarding are recorded. Default-off deployment can be a preparatory release but never closes launch acceptance.
- Delivery coordinator merges/deploys serially and verifies the actual /api/health release equals the expected commit or a later verified descendant. Run read-only live smoke and check legacy pickup/auth behavior. Record results in #657/#694.

## Rollback

Before release record the last good deployed SHA. If inactive code regresses existing behavior, use a reviewed revert through the coordinator and verify the rollback SHA and live smoke. If activated delivery fails, stop NEW dispatch while retaining event intake and reconciliation for in-flight attempts. Never delete attempts or repeat create to repair an unknown result. Cancellation/refund of an existing delivery is a separate scoped operation, not a code rollback side effect. Do not change production data or credentials as an implicit rollback.

## Checkpoint and estimates

Six implementation/review lanes have produced saved branches and PRs. This document is preparation, not a running background process or completed launch. Per-issue owners/run IDs, latest code/tests, local changes and remaining work are maintained on GitHub. Wolt planning envelope became 11.5–23 active agenthours after explicit facade slice #695; already performed work is not erased, but total actual time was not centrally measured. Shared owner implementation, test data/callback access and release waits are separate dependencies. The earlier conditional calendar estimate is not a promised deadline.
