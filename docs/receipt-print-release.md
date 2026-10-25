# Shared physical receipt design and explicit reprints

Issues #602–#607, parent #309. Owner requested matching physical/online designs and a Genprint action on both sales order receipt pages. Tasks are split into implementation/review slices of no more than60minutes. Development tests are executed locally; GitHub CI is the final release gate, not a substitute for local verification.

## Shared rendering

Kitchen and customer previews use the same bounded SVG geometry rendered into new CloudPRNT PNG payloads. DejaVu Sans Mono regular/bold font files and their license are bundled under public/fonts/orderfly and included in standalone tracing. Server rendering uses @resvg/resvg-js with system fonts disabled; sharp converts to black/white PNG. Output is384dots for58mm and576dots for80mm, with minimum30-dot text (10.64pt at203dpi). Browser preview centers this actual printable width on the selected paper. Device paper width wins when rendering a physical job.

Automatic kitchen originals retain their manifest/catalog hash, routing and immutable revision0 delivery semantics. Only newly frozen payloads get the shared design; no old dispatch payload is rewritten. Automatic purchase printing remains ordinary-product-only and bounded by its existing60minute window. Full saved menus and their quantities can be rendered through the explicit manual kitchen reprint path. This release does not silently enable unattended automatic menu printing or renew an exhausted window.

Manual customer receipts use immutable saved invoice facts when present. Current brand identity/logo and current receipt settings supply display branding. Logo fetches accept only configured public image hosts overHTTPS, refuse redirects/auth/ports, limit time/bytes/decoded pixels, and decode/re-encode PNG/JPEG/WebP. Unsupported/unavailable logos fail the print request rather than silently producing a differently branded receipt. Arbitrary SVG and local-network fetches are not supported.

## Local verification / release evidence

Local suites cover shared layout, actual font raster, minimumsizes,58/80mm mobile browser wrapping, both receipt pages, identity/scope and printer revision changes, idempotent enqueue, HTTP controls, token/device binding, transfer/ACK and original queue regressions. Independent agent review is performed before the exact-head PR CI/merge gate. Production rollout, active health release and live UI are verified after merge. Hardware print acceptance is recorded separately; a successful queue response never claims a physical print.
