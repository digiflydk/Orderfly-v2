# Esmeralda V2 (#780)

## Tenant and presentation boundary

`esmeralda2.orderfly.dk` is an explicit host alias of the existing `esmeralda` brand. It is not a new brand, location or catalog. Existing brand and location lookup, suspended-brand checks, menu pricing, modifiers, combos, delivery and payment logic remain authoritative. `esmeralda2` is reserved from future brand slug allocation.

Following PM visual acceptance on 2026-10-31, `StorefrontV2Provider` is enabled for the resolved `esmeralda` brand on every supported storefront entry, including `esmeralda.orderfly.dk`, the existing V2 alias, and apex brand paths. Other tenants retain their existing layout. The wrapper uses `data-storefront-version="2"`; portals must explicitly opt into V2 presentation while retaining React context. No query flag, redirect or saved preference is required. The existing domain, catalog, cart and payment return routing remain unchanged. Product add-to-bag stays outlined when the yellow menu action is shown, and yellow when it is the primary action.

The existing subdomain rewrite maps `/amager` to `/esmeralda/amager`. Existing long paths and checkout confirmation/cancellation URLs remain valid. Navigation stays relative on V2. Checkout derives the return origin from the current request, and the alias-aware slug helper keeps return paths on the V2 origin. App-wide APIs and assets retain existing passthrough routing. No data migration or payment integration change is required.

## Verification and release

Run `npm run typecheck`, `node --test tests/unit/esmeralda-v2-host.cjs tests/unit/brand-subdomains-12.cjs`, and the relevant UI/checkout suites. Host tests cover exact-match selection, standard-host and apex presentation, other-brand isolation, API/static passthrough, and mocked Stripe return addresses without production writes.

Follow AGENTS.md gates: green checks on the current head, independent Codex review without unresolved findings, current main, then authorized merge. Confirm hosting domain/TLS and `/api/health` release after deployment. Live QA must be read-only: menu, real prices, modifiers, cart and checkout navigation, without order creation or payment submission. Domain provisioning and complete live acceptance remain deployment checks, not proof supplied by unit tests.
