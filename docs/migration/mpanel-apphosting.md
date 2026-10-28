# mPanel App Hosting candidate — Website #41 / #45

The dedicated `mpanel.esmeraldapizza.dk` host serves seven existing operations shells and 39 pinned static assets. The compressed payload is outside `public/`; only exact manifest routes are served. Unknown paths return 404 and unsafe methods return 405. No fallback to a merchant storefront or generic mPanel shell is allowed. The public apex/www legacy routes use a fixed HTTPS destination with the original raw query appended unchanged. The dedicated host also canonicalizes known aliases and trailing slashes.

The existing Supabase UI loaders, API endpoints, mount points and host-only authentication bootstrap are retained byte-for-byte from the reviewed Website PR54 artifact. Serving a shell is **not** proof of authenticated access or backend authorization. The payload contains no credentials. Do not apply the read-only public design preview CSP: it disables the external operations runtime. Existing shell integrations, including legacy marketing scripts, are preserved pending a separately verified cleanup.

## Provenance and regeneration

Source: `digiflydk/Esmeralda-Website` PR54 commit `c041fdedefd6ba8c950190943d6033f9e1dc5427`, archive SHA256 `d1399dfd5b141e9ec60994de255d7c447dbd61142c29817c015ba37c89987c1d`. The manifest records hashes for every served byte. Run `python scripts/package-mpanel-host.py /path/to/materialized-artifact` after extracting that artifact. The packager verifies all source hashes before writing deterministic gzip JSON. It makes no network requests. `robots.txt` is generated to disallow crawling; all responses include noindex and no-store.

`src/lib/mpanel-host.ts` exposes exact-host detection and separate public-legacy/dedicated-host alias resolvers. The server handler uses the original request URL, never query-supplied file paths. Middleware must route the dedicated host before merchant/public routing, block direct `/internal-mpanel-host` access, and call the legacy resolver only for exact production apex/www hosts. Trace `./mpanel/esmeralda/**/*` into the deployed Next standalone bundle. Preserve a lone trailing `?` by slicing the original request URL rather than using URL.search.

## Validation and release gates

`node scripts/test-mpanel-host.cjs`: 279 cases spanning all seven shells, all 39 assets, robots, exact hashes, GET/HEAD, duplicate query keys, nested encoding, plus/space encoding, empty query, external redirect attempts, public-route exclusions, wrong hosts, internal-path probing, unknown paths and unsafe methods. `npm run typecheck` passes on the base plus this module.

Still required before migration acceptance: shared middleware/tracing integration; real Next HTTP checks against the integrated production build; independent review of the exact release commit; live domain/TLS verification; login/logout and real role-denial checks on the dedicated host; deployed Ops bootstrap compatibility; browser desktop/mobile QA. Timelog clock-in, booking mutations, printing and hardware remain untested because they create real records or require physical equipment. Do not represent isolated response tests as browser/login, production or physical QA.

Integration note (#64): Next15 can normalize percent escape casing and spaces before this handler. The adapter preserves the string it receives, but the full hosting contract preserves ordered decoded query entries, including duplicates/empty/literal plus/percent/nested URL/state, not byte-identical URL spelling. See `esmeralda-public-apphosting.md` and real Next HTTP tests.
