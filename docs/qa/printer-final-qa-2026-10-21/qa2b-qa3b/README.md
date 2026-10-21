# QA2b + QA3b remaining criteria — 2026-10-21 (after root audit #309 6326173811)

App: repo HEAD `70e45fd` = merge of `origin/main` `fef2c34` (current production release) into this evidence branch; `git diff origin/main HEAD -- src scripts tests package*.json next.config.js` is empty (recorded in each result as `appSourceDiffVsOriginMain: "none"`). Environment `demo-orderfly-qa0`: real Next dev app, real Firebase Auth + Firestore emulators (CLI 15.30.0, Java 21), accepted loopback network guard, real `/api/admin/session` cookies held in memory. No production access/writes.

## QA3b (#374) — `qa3b-http-two-pass-result.json`: 280/280, 21:29:15–21:34:48Z
- ONE emulator + app lifetime; the full HTTP matrix (133 cases incl. natural 120 s receipt expiry) plus retry cases R0–R4 runs as **pass 1**, then cleanup of exactly the declared disposable namespace (recursiveDelete of 6 declared docs + deletion of created Auth users), verified absence (declared docs/subcollections none, emulator root collections `[]`, Auth lookup 0), then **pass 2 with the identical IDs/emails** (create()/signUp would fail on any leftover) and the same cleanup/verification.
- `scripts/observer.cjs` (observation-only preload in the app process): wraps the real SDK `runTransaction` callback to count attempts; delegates everything unchanged; logs only seq/attempt count/matched-target flag/outcome code. Optional barrier pauses the matched transaction at the START of attempt 2 (before re-reads).
- Retry source is GENUINE Firestore contention: a second real transaction holds a read lock on the printer document while the app's request commits; the emulator aborts that commit and the SDK retries the SAME request (observer attempts=2). No error is mocked.
  - R1 resume: attempt 2 → 200, one `printer.resume` audit, receipt consumed once.
  - R2 queue revision advanced between attempts → attempt 2 re-reads → 409 `queue_review_blocked`, receipt unconsumed.
  - R3 native membership revoked between attempts → attempt 2 re-authorizes → 403, receipt unconsumed, printer unchanged.
  - R4 config edit retried → committed once, one audit.
  - R0 (no barrier, two concurrent resumes): pass 1 attempts [1,1], pass 2 attempts [1,2] — natural unprompted retry also observed.
- `scripts/launch.cjs`: scratch launcher (evidence only, not a replacement for `scripts/local-qa/run-backend.cjs`): pinned CLI/Java preflight, dotenv refusal, free-port check, allowlisted driver names, bounded driver deadline, process-group SIGTERM + wait + SIGKILL fallback. Single `--require` of the observer, which first loads the unchanged `scripts/local-qa/network-guard.cjs`.

## QA2b (#373) — `qa2b-browser-result.json`: 11/11, 21:35:10–21:35:37Z
Chromium, only 127.0.0.1:3100 reachable. Response-level FAULT INJECTION with REAL request forwarding: Playwright `route.fetch()` sends the real request (real server, real commit, verified natively), then the response is held (pending), dropped (`route.abort`) or replaced (generic 503 / malformed 201). No auth/login interception.
- X1 pending: Gemmer…, Annuller, fields, filters and Opdater locked; extra submits ignored (1 request); native commit already present while UI pending.
- X2–X7 accepted-but-response-lost for create, edit and delete: "Kunne ikke bekræfte…", input retained, save/confirm blocked, no automatic retry, exactly 1 request and 1 native commit/audit; explicit "Opdater oversigten" reconciles to native truth.
- X8 generic 503 after commit is NOT shown as writes-off; X9 malformed success not treated as success; X10 pending lifecycle dialog locks confirm and cancel.

Not covered: visible login form (#381/#382), production writes, physical printing, Wolt, #344 dates.
