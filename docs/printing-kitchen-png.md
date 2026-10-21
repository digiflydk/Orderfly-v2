# Bounded kitchen PNG encoder (#329)

`encodeKitchenPng(snapshot, { model, paperWidthMm })` in
`src/lib/printing/kitchen-png.ts` produces a deterministic `image/png` Buffer from
the explicit kitchen-only snapshot already validated by `renderKitchenReceipt`.
This is CPU-only encoding, with no production imports/calls, database, device
credentials, HTTP endpoint, printer command, job dispatch or hardware connection.
Printer administration remains superadmin-only. Configuration writes and live
output remain off. The #309 coordinator owns CI integration and serialized release.

## Format decision, verified against official Star sources on 21 October 2026

- [CloudPRNT media types](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/index.html)
  list `image/png` for mC-Print2 and mC-Print3. This encoder advertises precisely
  that type; it does not label binary printer commands as generic data or text.
- [Image printing](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/image-printing.html)
  describes pixel-for-pixel output by default. The server must match resolution;
  the image is already monochrome, avoiding device font/codepage dependencies.
- [CPUtil device profiles](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/cputil.html)
  identify 384-dot 58 mm and 576-dot 80 mm profiles for these printer families.
- [Text printing](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/protocol-reference/common-spec-reference/content-mediatypes/text-printing.html)
  uses the printer's default font/codepage. Sending Unicode as plain UTF-8 would
  therefore not by itself establish Danish text compatibility. We choose PNG.

These sources establish a documented format/profile, not the restaurant printer's
actual firmware, print-area settings, paper guide, resolution or physical fit.
Every result retains `physicalFitVerified: false`. Only mC-Print2 with 58 mm and
mC-Print3 with 58/80 mm are accepted. Model-family input is configuration, not
verified hardware evidence. No setup or capability record is changed here.

## Fixed glyph repertoire and bounds

The embedded `orderfly-kitchen-bitmap-v1` font has printable ASCII plus
`ÆØÅæøå`, preserving case. It is a small fixed 5x10 monochrome alphabet drawn
in source and scaled 2x into 12-dot cells, with 24-dot row spacing. There are no
host fonts, external resources, SVG markup, fallback glyphs or codepage settings.
NFC normalization in the existing renderer makes decomposed Danish ring text
use the same pixels. Other accented characters, emoji, CJK and remaining Unicode
are rejected with the fixed `unsupported_character` code. **No transliteration,
replacement or dropped kitchen instruction is permitted.** Extending the font
repertoire or using an embedded general font is a separate reviewed task.

The existing 32/48-column kitchen renderer supplies all labels, quantities,
products, modifiers, notes and wrapping. Input is the snapshot, never a caller
provided preview object or arbitrary image. All existing privacy/strict-field,
control-injection and input/line/output limits still apply. Free text is not a
personal-data detector; callers must continue providing kitchen-only content.
The encoder adds an 8192-dot image-height cap and a 256 KiB payload cap, checked
before returning a complete payload. Taller receipts fail rather than truncate.
Only PNG signature, IHDR, IDAT and IEND chunks are emitted. There is no metadata,
HTML, drawer pulse, buzzer, cut command or caller-provided encoded data. Device
cut behavior is outside this module and must be addressed in the later transport
adapter and hardware pilot, not inferred from the absence of command bytes.

Return contract:

```ts
{
  contentType: 'image/png',
  payload: Buffer,
  raster: { model, paperWidthMm, widthDots, heightDots,
    font: 'orderfly-kitchen-bitmap-v1', physicalFitVerified: false }
}
```

Errors expose fixed codes, never rejected text. No partial image is returned.
The caller must not log the PNG payload, which contains the kitchen text.

## Verification and release boundary

Run `npm run typecheck` and:

```sh
node --test tests/unit/printing-kitchen-png.cjs tests/unit/printing-receipts.cjs tests/unit/printing-cloudprnt.cjs
```

The new tests decode real PNGs through the existing Sharp dependency, verify
binary pixels/dimensions and Danish ring/slash marks, immutable deterministic
output, strict models/profiles/private fields/controls, unsupported glyph failure,
height rejection and actual CloudPRNT poll/query/confirmation parser negotiation.
A small test-only GET simulation serves immutable copies of the PNG bytes. It is
not a server endpoint, durable queue worker or actual device simulator/print.
Fixture PNGs in `test-results/kitchen-png-{58,80}.png` support visual inspection;
they are synthetic encoding proof only. No browser user flow changes.

Exact-head independent Codex review and CI must pass before coordinator merge;
changed main requires synchronization and renewed gates. Post-deploy health and
public smoke establish release health, not live invocation of this encoder.
Physical readability, glyph fidelity, print-area settings, paper feeding, cutting
and interoperability with Wolt remain unverified until the final hardware pilot.
