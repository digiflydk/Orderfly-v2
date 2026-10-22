# QR render and export (#391 / #389)

Implementation candidate, not a deployed QR module. This server-side helper uses the
existing `qrcode` package and returns both SVG and PNG for one validated payload.
It does not fetch a destination, store data, authorize a caller or record a scan.
The calling API must enforce brand permissions, request limits and destination rules.

`renderQr(payload, options?)` returns `{svg, png, width, moduleCount, style}`.
`png` is a Node Buffer; `svg` is a standalone string. Defaults: 512 px, four-module
quiet zone, H error correction, black foreground and white background. Options:
`width` integer 128–4096, `margin` integer 4–32, `errorCorrectionLevel` L/M/Q/H,
`dark` and `light` opaque six-digit hex colours, and optional `logo` Buffer.
Unknown option keys are refused. The returned `style` never includes logo bytes.

The foreground must be darker than the background with a calculated contrast
ratio of at least 4.5:1. This check is a conservative style constraint, not a
guarantee of physical print quality. Export is refused below three pixels per
module including the quiet zone. SVG remains vector when printed or resized.
Payloads must be nonblank valid Unicode of at most 2048 UTF-8 bytes; capacity at
the chosen correction level can impose a lower limit. The payload is not trimmed
or rewritten. Typed `QrRenderError.code` values are `invalid_payload`,
`invalid_style`, `insufficient_contrast`, `payload_too_dense`, `invalid_logo`
and `unreadable_logo`.

## Raster logos (#398)

The optional logo accepts a PNG/JPEG Buffer, never a remote URL or SVG. Input is
limited to 2 MB, 2048 px per side and 4,194,304 decoded pixels. Signature and actual
format are checked; multipage images are rejected. The logo is re-encoded to PNG
without metadata, contained on the chosen light colour and covered by at most
15% of the inner QR width. H correction is mandatory. Each final PNG is actually
decoded with `jsqr`; failure or a changed payload returns `unreadable_logo`.
The SVG embeds the same sanitized raster at the same central position. Tests
also decode its rasterized output. These checks cannot guarantee camera/print
performance under every physical condition.

The calling upload API still needs authenticated brand access and request-body
limits before collecting a logo Buffer. This helper does not implement uploads.

## Print helper (#398)

`qrPrintHtml(renderedQr, {title?, caption?, sizeMm?})` returns a standalone HTML
document with the exact exported PNG, escaped text and physical image dimensions
in millimetres. Defaults to 60 mm; bounds 25–150 mm and at least 0.4 mm per QR
module including its quiet zone. Title/caption have bounded lengths. Content
Security Policy blocks scripts and external requests. No script or popup opens
automatically. The calling UI can expose the document for the browser's Print /
Save as PDF command. This is not a direct PDF download. Print at actual size,
preserve margins, and test the actual printed code before distributing it.

Verification: `node --test tests/unit/qr-render.cjs` executes the real QR renderer,
decodes PNG and rasterized SVG with `jsqr`, checks dimensions and quiet-zone
pixels, exercises all correction levels and branded colours, and rejects unsafe
style, malformed Unicode and dense/oversized payloads. This isolated automated
check is not browser live QA or a physical phone/printed-label acceptance test.
Logo tests cover real PNG/JPEG at three output sizes, hostile formats/dimensions,
correction rejection and fail-closed decoder failure. Print tests cover text
escaping, image preservation, millimetre bounds and dense-code rejection.
Full repository typecheck, CI and independent current-head review remain release
gates. No production data, secrets, dependencies or shared files change here.
