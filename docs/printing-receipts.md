# Kitchen receipt text preview (#319)

`src/lib/printing/kitchen-receipt.ts` is a pure deterministic Unicode preview renderer.
It has no production imports, order projection, persistence, HTTP route, credentials,
job dispatch or printer commands. Configuration and actual output stay disabled.
The coordinator in [#309](https://github.com/digiflydk/Orderfly-v2/issues/309) owns
shared CI and serialized merge/deploy under `AGENTS.md`; code/CI/review/deployment,
live QA and physical printer QA remain separate gates.

## Official Star verification, 21 October 2026

Checked the official CloudPRNT Protocol Guide **2.6.0**, last updated 15 September 2026:

- [Content Media Types, device table and appendix](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/index.html):
  `text/plain` is supported on mC-Print2/3. This task does not advertise or serve it.
- [Text Printing, paragraphs 1–3 and compatibility note](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/text-printing.html):
  plain text uses the device's default font/codepage. Control sequences belong in an
  explicit printer emulation format. A MIME parameter is not proof of Unicode support.
  This renderer consequently produces a JavaScript preview string, **not verified
  UTF-8 printer data**. Star also describes automatic cutting for plain-text jobs;
  rendering this offline preview neither sends a job nor invokes a cutter.
- [Print-job data limits, GET table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/printjob-datasize/index.html):
  the applicable generic device ceiling is 512 KB. Our lower 32 KiB preview-output
  limit is an application bound, not a claim of device compatibility.

No universal physical text column count or Danish codepage guarantee was established
for the restaurant's exact models/firmware/default fonts. The named **58 mm preview**
uses 32 grapheme columns and **80 mm preview** uses 48, with explicit configurable
16–80 columns. These are preview conventions, not measurements of printable paper,
dots, device font cells or terminal display width. A CJK glyph or emoji counts as
one preview grapheme and may occupy a different physical width or be unsupported.
Every result carries `physicalFitVerified: false`. Before any future transport,
verify model, firmware, codepage/font, actual columns, Danish glyphs, wrapping and
cut behavior through a reviewed encoder and physical pilot. Preserve Wolt operation.

## Explicit snapshot contract

`renderKitchenReceipt(snapshot, { paperWidthMm: 58 | 80, columns? })` validates unknown
input with strict allowlisted objects. All fields except optional notes/modifiers
must be supplied. Fulfillment time is display text from the caller; no time, timezone,
location or customer action is inferred.

```ts
{
  orderReference: 'TEST 42',
  fulfillmentLabel: 'Afhentning',
  fulfillmentTime: '21.10.2026 18:30',
  items: [{ quantity: 2, name: 'Pizza med bøffelmozzarella',
    modifiers: ['Uden løg'], kitchenNote: 'Skær i otte stykker' }],
  kitchenNote: 'Kun køkken'
}
```

No arbitrary order/provider object is accepted. Unknown properties, including address,
email, phone, credentials and payment/session/job/review tokens, reject the entire
snapshot, including inside items. Display references must not be secrets or internal
identifiers. Free-text fields are not a personal-data detector or redactor: the
caller must supply kitchen-only text. Native order-to-snapshot mapping is a separate
reviewed task and production integration is absent here.

Limits: 1–50 items, quantities 1–99, at most eight modifiers/item; reference 32,
fulfillment label/time 64 each, name/modifier 160, note 400 UTF-16 code units;
8192 normalized input code units total, 512 output lines, 32768 UTF-8 bytes for
preview size accounting. Excess is rejected without truncating kitchen instructions.
Strings normalize to NFC and collapse Unicode space separators. Empty strings,
control characters, format/bidi controls, line/paragraph separators and lone
surrogates reject. This includes ESC/GS/cutter/drawer commands, tabs and caller line
breaks. Generated line breaks and fixed indentation provide structure. ZWJ and
other format characters also reject; ordinary Danish, combining accents, CJK and
simple emoji are supported in previews. Literal markup stays inert plain text.
Any future HTML preview must render `text` as a text node, never raw HTML.
Errors expose fixed codes only, without rejected input.

Wrapping counts Unicode grapheme clusters with `Intl.Segmenter('und')`, prefers
spaces and splits longer words without dropping clusters. Indentation repeats for
continuation rows. No device-width or encoded-byte-width calculation is implied.
The returned `utf8Bytes` is only memory-size accounting; there is no MIME type,
encoded print buffer, cut or drawer operation in the result.

## Verification and release boundary

Run `node --test tests/unit/printing-receipts.cjs tests/unit/printing-cloudprnt.cjs`
and `npm run typecheck`. Actual content fixtures cover both default profiles,
configurable Unicode wrapping, Danish glyphs, NFC, strict omission/privacy boundaries,
invalid quantities/shapes/widths, control injection and aggregate bounds. Tests use
only synthetic snapshots, with no production reads/writes or physical connection.
Root adds the dedicated preview regression to CI. Browser tests are not applicable
to this pure module because no page or user flow changes.

Independent review and CI must be green on the current PR head before the coordinator
merges; a changed `main` requires synchronization and renewed gates. Post-merge
read-only release/health/public smoke establishes deployed-version health, while
renderer fixture output remains software proof. There is no live renderer endpoint
or authenticated rendering acceptance to claim. Physical output and encoding/fit
stay unverified until the final hardware pilot.
