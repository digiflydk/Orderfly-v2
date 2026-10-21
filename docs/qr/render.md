# QR render and export (#391 / #389)

Implementation candidate, not a deployed QR module. This server-side helper uses the
existing `qrcode` package and returns both SVG and PNG for one validated payload.
It does not fetch a destination, store data, authorize a caller or record a scan.
The calling API must enforce brand permissions, request limits and destination rules.

`renderQr(payload, options?)` returns `{svg, png, width, moduleCount, style}`.
`png` is a Node Buffer; `svg` is a standalone string. Defaults: 512 px, four-module
quiet zone, H error correction, black foreground and white background. Options:
`width` integer 128–4096, `margin` integer 4–32, `errorCorrectionLevel` L/M/Q/H,
`dark` and `light` opaque six-digit hex colours. Unknown option keys are refused.

The foreground must be darker than the background with a calculated contrast
ratio of at least 4.5:1. This check is a conservative style constraint, not a
guarantee of physical print quality. Export is refused below three pixels per
module including the quiet zone. SVG remains vector when printed or resized.
Payloads must be nonblank valid Unicode of at most 2048 UTF-8 bytes; capacity at
the chosen correction level can impose a lower limit. The payload is not trimmed
or rewritten. Typed `QrRenderError.code` values are `invalid_payload`,
`invalid_style`, `insufficient_contrast` and `payload_too_dense`.

Logo overlay is not implemented. It needs a separate bounded raster upload path,
image dimension/decompression limits, H correction, controlled central coverage,
and successful decoding of the final PNG and SVG export before being offered in
the UI. Arbitrary SVG, image URLs and unverified overlays are not accepted here.
PDF/print layout belongs to the calling UI and is not claimed by this helper.

Verification: `node --test tests/unit/qr-render.cjs` executes the real QR renderer,
decodes PNG and rasterized SVG with `jsqr`, checks dimensions and quiet-zone
pixels, exercises all correction levels and branded colours, and rejects unsafe
style, malformed Unicode and dense/oversized payloads. This isolated automated
check is not browser live QA or a physical phone/printed-label acceptance test.
Full repository typecheck, CI and independent current-head review remain release
gates. No production data, secrets, dependencies or shared files change here.
