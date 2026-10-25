# Location terminal authentication (#635, #636, #637)

The terminal has a dedicated location-scoped login. It does not mint an Orderfly administrator identity or change `__session`. Existing admin authentication and its expiry remain unchanged. `/terminal/login` uses `/api/terminal/auth/login`; protected terminal business adapters independently revalidate the resulting narrow capability.

## Configuration and private storage

An existing administrator with `orderfly.catalog:view` for the exact native location may GET `/api/superadmin/locations/{locationId}/terminal-login`. An administrator with `orderfly.catalog:edit` may PUT `{username,enabled,password?,expectedRevision}` from the same origin. The transaction rereads the current policy and native brand/location before mutation. Native brand must be active/trialing and location active. GET returns only `{configured,enabled,username,revision,canEdit}`. First configuration requires a password; omitting a password later preserves its hash. Every successful edit increments the revision and invalidates all older terminal sessions. Stale revision or occupied username returns409.

Login usernames normalize to lowercase after trimming,3–64 ASCII letters/digits/dot/underscore/hyphen. Passwords are12–128 characters for configuration and never trimmed. Password hashes use asynchronous scrypt (`N=16384,r=8,p=1`,64-byte output,random16-byte salt); password verification uses constant-time comparison. Neither passwords nor hashes are returned in metadata, written to public location documents, or logged.

Private top-level documents:

- `terminalCredentials/{locationId}`: native scope, normalized username, salt/hash, enabled flag and monotonic revision.
- `terminalUsernames/{sha256(username)}`: unique location claim. Rename claims the new name and releases only the same location's old claim atomically with the credential update and audit.
- `terminalSessions/{sha256(token)}`: native scope, credential revision, creation time and nullable revocation time. Raw token is never persisted.
- `terminalLoginThrottle/{bucket}`: durable attempt count and window start. Existing root-confirmed default-deny client rules protect these private collections; no rules/index deployment is introduced here.

The audit contains actor, native scope, revision and enabled flag, but no password, hash, token or username. Configuration is not automatically provisioned or activated in production by deployment.

## Session lifetime and authority

Login produces a cryptographically random256-bit token. Only the token hash identifies the server-side session document. The browser receives `__Host-orderfly_terminal` with `Secure; HttpOnly; SameSite=Lax; Path=/`, no Domain, and Max-Age400days. The host-only prefix prevents sibling brand hosts from shadowing the terminal cookie. HTTPS is required outside local development.

There is **no server idle or absolute expiry**. Session remains valid until explicit logout, credential change/disable, or native brand/location deactivation/removal. Browser storage deletion, private browsing and browser retention limits can still require login. Chrome caps cookie lifetime at400days: https://developer.chrome.com/blog/cookie-max-age-expires/ . Session POST renews the browser lifetime during use; GET performs no renewal or data writes. A new successful login in the same browser revokes its previous durable terminal session before replacing the cookie.

`getTerminalSession()` returns null only when the dedicated cookie is absent. Present malformed/revoked cookies raise401 and never fall back to an administrator cookie. Backend failures raise503. The returned frozen `TerminalSession` is a process-local minted capability; cloned or caller-created objects do not authorize anything. `authorizeTerminalTransaction(tx,session,brandId,locationId)` rereads durable session, current enabled credential revision and active native ownership inside each business transaction. Actor IDs are stable64hex hashes scoped to the session, not an administrative employee identity. B's adapter maps only the authorized terminal operations; core itself grants no printer-administration/catalog access.

## HTTP and retry behavior

- Login POST JSON`{username,password}` returns safe `{authenticated:true,brandId,brandName,locationId,locationName}` and sets cookie. Token is absent from JSON.
- Session GET returns that metadata read-only. Session POST JSON`{}` verifies the durable state and renews the same cookie without changing server lifetime.
- Logout POST JSON`{}` durably revokes before clearing the cookie. Missing, malformed and already-revoked tokens are idempotent success. A failed durable revoke returns503 without falsely clearing/confirming logout.
- All mutations require exact same trusted external origin, reject cross-site Fetch Metadata, accept only bounded4096-byte UTF-8 JSON with no content encoding, reject unknown keys and URL query additions. GET responses are `no-store` and vary by cookie.
- Wrong/unknown/disabled credentials use the same generic401 error. Unknown names still run password hashing. Responses never contain provider/internal exceptions.

Durable throttle allows12 attempts in15minutes per configured username. Unknown usernames share64 fixed hash buckets, bounding anonymous junk-document creation and avoiding a single global lock that an attacker could use against all brands. Unknown-name collisions may temporarily rate-limit another unknown name; known locations remain isolated. Throttle persists across instances/restarts, counts successful attempts as well, and returns generic429 plus Retry-After900. Throttle expiry is logical at the next attempt, not a scheduled cleanup task. No new paid service or background integration is required.

## Validation and release boundaries

A's actual-module tests cover atomic rename/password preservation, atomic rollback, previous-browser-session revocation, safe HTTP metadata/cookie flags, GET without renewal, POST renewal, CSRF/strict payload rejection, durable logout retry and no false success on failed revoke. E independently exercises the real native authorization chain with strict local persistence fixtures, including long-lived session use, revocation races and non-escalation.

These are local synthetic service/HTTP tests, separate from actual browser tests and production acceptance. Do not infer real iPad retention across sleep or physical printer behavior from server tests. All current-head review/CI, integrated browser checks, deployment SHA verification and relevant live acceptance remain coordinator gates.
