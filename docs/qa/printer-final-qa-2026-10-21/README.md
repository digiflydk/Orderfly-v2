# Printer module final QA — 2026-10-21

Isolated QA evidence for #372/#373/#374 (originals #295, #296, #298, #301, #305, #306, #318, #325, #361).

- Environment: `QA0a-local-backend`, project `demo-orderfly-qa0` (accepted #378 harness: real Next dev app, real Firebase Auth + Firestore emulators, loopback network guard). App commit `c2745f90017f80dfe025158f577d668714604007` (= production `/api/health` release at test time).
- Browser: headless Chromium (Playwright 1.62, `/opt/pw-browsers/chromium`). Only `127.0.0.1:3100` reachable; all other requests aborted.
- Sessions: real emulator users → real `/api/admin/session` → real `__session` cookie, held in memory and added to the browser context. The visible login form is NOT covered here (owned by #381/#382).
- Results: `http-result.json` (133/133), `browser-result.json` (37/37), `browser-writes-off-result.json` (4/4, app restarted with `ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED=false` locally), `browser-error-handling-result.json` (2/2).
- No production data, users, flags, hardware or Wolt touched. No credentials, cookies, receipts or tokens in these files. Screenshots show synthetic `qac-*` data only.
- Not proven here: production writes, physical printing, natural Firestore SDK transaction retry (covered by unit fixtures `tests/unit/printing-resume.cjs`, `printing-queue-review.cjs`), activation/last-used dates (#344).

Rerun: install `firebase-tools@15.30.0` + Java 21 per `docs/printing-local-qa.md`, then
`QA0_FIREBASE_BIN=… QA0_JAVA_BIN=… node docs/qa/printer-final-qa-2026-10-21/scripts/launch.cjs driver.cjs` (scripts expect the repo at `/home/user/Orderfly-v2`).
