# Additive Mpanel origin preparation

Tracks [Esmeralda-Website #36](https://github.com/digiflydk/Esmeralda-Website/issues/36)
under migration coordination #18. The receiving `/admin-login/mpanel` page accepts
exactly `https://mpanel.esmeraldapizza.dk` in addition to the existing apex and
`www` origins. No wildcard, HTTP origin, alternate port, path suffix or lookalike
host is accepted. The actual message origin must match the requested origin.

The existing opener identity, message type, token format, server redemption and
destination checks remain unchanged. Adding this origin does not create a session,
grant access, provision a domain, or activate the new Mpanel host. The return link
and global canonical Mpanel links intentionally remain on the current website
until the coordinator verifies DNS and the destination application separately.

## Internal validation

`npm run typecheck`

`CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/mpanel-launch-browser.cjs tests/unit/mpanel-launch.cjs`

The browser harness renders the actual receiving component with synthetic HTTP
responses. It verifies all three accepted origins at mobile/desktop widths,
server denial, unrelated message type, foreign window source, mismatched origin,
malformed token, direct visits without an opener, and untrusted requested origins.
Invalid events precede a valid control token, so the test proves both rejection
and continued successful operation. No production request or session is created.

This is preparation only. Paired Mpanel changes, DNS/TLS, exact deployed commit
and authenticated live acceptance remain separate migration gates. No GitHub
Actions, secrets, production data or hosting configuration are changed here.
