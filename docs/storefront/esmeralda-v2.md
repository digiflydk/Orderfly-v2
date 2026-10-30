# Esmeralda V2 (#780)

## Tenant and presentation boundary

`esmeralda2.orderfly.dk` is an explicit host alias of the existing `esmeralda` brand. It is not a new brand, location or catalog. Existing brand and location lookup, suspended-brand checks, menu pricing, modifiers, combos, delivery and payment logic remain authoritative. `esmeralda2` is reserved from future brand slug allocation.

Only the exact V2 host enables `StorefrontV2Provider` in the server brand layout, and only for the `esmeralda` brand. V1 (`esmeralda.orderfly.dk`), apex paths and other tenants do not enable it. The wrapper uses `data-storefront-version="2"`; portals must explicitly opt into V2 presentation while retaining React context. No query flag or saved preference switches V1 traffic into V2.

The existing subdomain rewrite maps `/amager` to `/esmeralda/amager`. Existing long paths and checkout confirmation/cancellation URLs remain valid. Navigation stays relative on V2. Checkout derives the return origin from the current request, and the alias-aware slug helper keeps return paths on the V2 origin. App-wide APIs and assets retain existing passthrough routing. No data migration or payment integration change is required.

## Verification and release

Run `npm run typecheck`, `node --test tests/unit/esmeralda-v2-host.cjs tests/unit/brand-subdomains-12.cjs`, and the relevant UI/checkout suites. Host tests cover exact-match selection, V1 isolation, other-brand path scoping, API/static passthrough, and mocked Stripe return addresses without production writes.

Follow AGENTS.md gates: green checks on the current head, independent Codex review without unresolved findings, current main, then authorized merge. Confirm hosting domain/TLS and `/api/health` release after deployment. Live QA must be read-only: menu, real prices, modifiers, cart and checkout navigation, without order creation or payment submission. Domain provisioning and complete live acceptance remain deployment checks, not proof supplied by unit tests.
