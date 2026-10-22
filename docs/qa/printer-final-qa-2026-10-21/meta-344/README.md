# #344 printer activity metadata — isolated acceptance 2026-10-22

Source: `origin/main` `ac36202ce61f8aded33887c9b92cf144514b4534` (tree `3ee56908…`), which already contains #458 (`2ea44b6`) and #457 (`600d215`) and is the deployed production release at test time. Environment `demo-orderfly-qa0`: real Next dev app, real Auth/Firestore emulators, real session cookies (memory only), headless Chromium restricted to 127.0.0.1:3100. Result `result.json`: 39/39, 01:10:34–01:11:01Z.

The `confirmed` case uses a SEEDED isolated statusMetadata fixture (lastConfirmedPrintAt 2026-10-21T22:30:00Z) to prove rendering/projection only. It is NOT evidence of a CloudPRNT acknowledgement chain (#456/#460/#461 not integrated). Unit tests on the same source: 78/78 (activity-metadata, reads, resume, writes, lifecycle, printing-ui-browser).
