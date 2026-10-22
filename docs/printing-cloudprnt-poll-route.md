# Scoped CloudPRNT connectivity endpoint

Issue #507 exposes the reviewed #489 identity-only adapter at:

`POST https://orderfly.dk/api/cloudprnt/{brandId}/{locationId}/{printerId}`

The route runs on Node and is dynamic. The three path identifiers are nonsecret native selectors. They do not authenticate a device or grant access. The existing adapter revalidates current brand/location ownership, printer revision and private device credentials in one read-only native transaction on every poll and SDK retry. Scope is never taken from poll JSON or query parameters. Provisioned Basic credentials belong in the Authorization header, never the URL or GitHub.

Successful authentication returns exactly `{"jobReady":false}` after transaction completion. Responses are not cached and vary by Authorization. The existing HTTPS, content-type, streamed 8192-byte body, strict UTF-8, header and parser bounds remain in effect. Invalid route/context inputs receive a fixed private error. The route makes no configuration, queue, result, capability, credential or usage writes.

Before reading route parameters, streaming the body or obtaining Admin/Firestore, the route reserves a process-local admission slot. The global bucket admits a burst of 20 and refills at 120 requests/minute; a credential-digest bucket admits a burst of 10 and refills at 30/minute. At most eight requests may be in flight. The bounded map retains at most 128 keys, removes idle keys after one minute, and stores only SHA-256 header digests, never credentials. Missing/oversized headers share an anonymous bucket. Rotating credentials, paths or spoofed forwarding headers cannot bypass the global bound. The slot releases in `finally`, including malformed inputs and native failures. Rejection returns fixed HTTP429 with `Retry-After:5`, no-store and Authorization Vary before native I/O. Authentication remains required for every admitted request.

These limits apply per running Node process and reset on restart; this is not a distributed edge quota. Multiple hosting instances multiply the bound. A deployment-level global ingress limit remains useful for stronger fleet-wide denial-of-service protection. The route does not infer a trusted client IP from public headers or use extra Firestore reads to enforce its admission bound.

This endpoint provides a deployable connectivity boundary. It does not dispatch, download bytes, accept a result, issue client actions, record protocol observations or trigger a testprint, even if flags elsewhere change. Production configuration, intent and output stay off. Device setup and credential provisioning require their own controlled authorization; no physical printer was contacted during implementation.

## Verification

Run `npm run typecheck` and `node --test tests/unit/printing-cloudprnt-poll-route.cjs tests/unit/printing-cloudprnt-poll-http.cjs`. The route regression invokes actual exported POST, adapter, native verifier and credential crypto, replacing only Admin I/O. It covers successful read-only completion, scope/revocation/retry denial, malformed request/context and private provider errors. These are isolated software checks, not device connectivity or physical output proof. Independent review, CI, root serial release and applicable read-only live verification remain separate gates.

## Remaining first-testprint prerequisites

- Qualify one actual device and its native enrollment under #485: exact model/variant, installed firmware, paper/guide and output geometry, preserving Wolt. The current token-based pilot requires firmware at least 3.2. The existing source-decision document supplies collection methods; no physical evidence is fabricated by this route.
- Complete the qualified capability producer/output-policy consumer. An authenticated poll alone grants no compatibility or dispatch authority.
- Wire immutable synthetic #355 PNG content to an explicitly controlled single-device test-job producer and durable delivery/download ownership. Current #355 content is otherwise unwired.
- Finish authenticated result/replay/queue transfer integration under #461/#456, then test the full isolated software path.
- Provide a reviewed explicit single-device activation/testprint action and authorized pilot window. Record the real result and inspect paper fit, Danish glyphs and cut. Simulator results cannot satisfy physical acceptance.

The full automatic order/payment flow has separate software prerequisites, including unpaid acceptance manifests and isolated intent-ON settlement proof. Those must not be presented as hardware blockers or assumed necessary to manufacture a synthetic receipt.
