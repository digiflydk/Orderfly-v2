# CloudPRNT HTTP protocol foundation (#311)

Implemented: pure bounded HTTP protocol parsing/response formatting in `src/lib/printing/cloudprnt-http.ts` and an **in-memory HTTP-shaped simulator** in `tests/helpers/cloudprnt-simulator.cjs`. It opens no socket and is not a production service. Nothing imports it into merchant/order execution, selects a live job, persists state, authenticates a printer, changes flags or enables output. Existing printer/queue contracts remain untouched.

## Protocol basis

Checked against Star's [CloudPRNT guide 2.6.0](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-guide.html), updated 15 September 2026, retrieved 21 October 2026:

| Exchange | Implemented subset | Primary reference |
|---|---|---|
| POST poll | JSON status is required; all other core fields may be omitted/null. Decode status once. Ignore peripheral/extension payloads in returned projection. | [JSON request](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-request.html) |
| POST response | Idle `jobReady:false`, or ready plus actual available `mediaTypes`, `jobToken`, `deleteMethod:DELETE`. Busy/error/unknown status, active progress or existing token blocks a fresh offer. | [JSON response](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/server-polling-post/json-response.html) |
| GET job | `mac`, optional `uid`, `token`, optional requested `type`; omitted type selects preferred format. Same GET returns same content without state mutation. | [GET request](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-request-get/get-request.html) |
| GET response | Binary content with its actual MIME type, not JSON. Simulator emits 200, 404 for unavailable/wrong identity, 415 for unavailable representation. | [GET response](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-request-get/get-response.html) |
| DELETE result | Query includes identity/token, `code`, optional `retry`. Explicit 200/200 OK/OK is confirmed; reported error is failure; other status remains uncertain. Ack body is empty. | [Confirmation and retry](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/http-method-reference/job-confirmation-delete/index.html) |
| Printer status | 3/4 digits are printer codes, not HTTP response statuses. 22x busy; other 2xx statuses online; 4xx/5xx and four-digit 1xxx statuses report errors. Three-digit 1xx and undocumented widths remain unknown. Unknown families remain unknown. | [Status codes](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/printer-status-code/index.html) |

The parser accepts 8 KiB maximum poll JSON and 2 KiB query strings, rejects duplicate/unknown query keys and malformed encodings/types, and validates colon-delimited MACs. Supported job MIME subset: PNG and plain text only. [Star's device media table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/index.html) lists both for mC-Print2/3; Star raster belongs to HI01X and is rejected. No command-data format is advertised or generated. Token subset is 1–128 ASCII letters/digits/underscore/hyphen, intentionally narrower than the protocol's free-form tokens. Printer MAC and uid are **identification only**, never authorization.

This simulator requires job-token-capable firmware: mC-Print2/3 >=3.2. It does not support older tokenless firmware, fallback GET deletion, client actions/peripherals, Star configuration/firmware jobs, custom cut/buzzer/cash-drawer headers, media conversion, authentication, printer status ASB interpretation or MQTT. Model and firmware must be verified before any real device use. The official compatibility table identifies mC-Print2 HTTP support and restricts mC-Print3 MQTT to particular variants/firmware; this work chooses neither a production transport nor broker.

## Conservative simulator policy

The caller supplies a single fixed fixture job, identity and bytes. A ready POST offers it once, then waits for a result. GET never consumes or advances it. Repeated matching DELETE results acknowledge idempotently; contradictory terminal outcomes return 409. A result for another MAC/token returns 404. The simulator's MAC match tests correlation only, not security.

Missing DELETE, an idle poll or absence of optional `printingInProgress`/`jobToken` does not confirm printing. Explicit lost-result simulation enters `uncertain`, blocks fresh offers and GET retries, and permits a later correlated result. A matching error poll blocks automatic retry even if the device later looks ready. A reported failure does not prove that no paper was produced. These are conservative local policies, not a claim of production exactly-once physical printing. Production attempt ownership, timeout handling, durable reconciliation, queue-ledger changes and authorization remain separate tasks.

## Verification and release

Run `node --test tests/unit/printing-cloudprnt.cjs` (14 tests) and `npm run typecheck`. A separate existing-CI step runs the protocol suite without modifying workflow permissions. Cases exercise valid/null/optional input, malformed/oversized payloads, encoding and duplicate parameters, status families, media negotiation, repeated GET, duplicate/conflicting/foreign results, error recovery and lost result without replay.

These fixtures are protocol simulation only. There is no new live endpoint to verify. A release must pass exact-head CI and independent Codex review, then deployment health/public regressions against the verified commit. Production protocol QA, end-to-end order printing and both physical printers remain unverified and must not be marked passed. Live output stays off pending the separately authorized physical pilot.
