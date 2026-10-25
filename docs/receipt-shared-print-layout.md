# Shared receipt layout

`src/lib/receipts/print-layout.ts` produces the same bounded SVG document for the
browser receipt previews and server-side CloudPRNT rasterization. Kitchen and
customer receipts have distinct content projections but share layout primitives.
The kitchen document preserves prominent order reference, fulfillment/time,
boxed comments, category bars, literal additions/removals, and menu components.
Customer receipts retain fiscal amounts, seller identity and the selected fields.

Kitchen modifiers and individual menu components have a 24-dot (approximately
3 mm) empty outlined square for staff to tick on paper. Each logical item gets
one square, even when its text wraps across several lines. Continuation lines
align with the item's text, reserving space for the square without shrinking the
font. Main products, category/group headings and customer receipts do not gain
checkboxes. The squares are part of the shared SVG, so previews and new physical
prints show the same marks; they are not interactive controls or saved status.

Coordinates are printer dots at 203 dpi: 80 mm profiles use 576 dots, 58 mm use
384 dots. Every text style is at least 30 dots (10.64 pt at 203 dpi), including
labels, totals and menu group names. Larger order identifiers and product lines
create a visual hierarchy. Long text wraps rather than shrinking below the
minimum. A receipt exceeding 8192 dots, 500 lines or the bounded input budget is
rejected; it is never clipped or silently truncated.

Both sides use the supplied DejaVu Sans Mono regular/bold font assets. Browser
SVG text uses the `Orderfly Receipt` font-face alias; the server must load the
same font files and disable system-font fallback. The underlying bitmap v1/v2
test job encoders remain immutable and independent of this renderer.

Text is XML-escaped. Arbitrary SVG, HTML, event handlers and remote image URLs
are never interpolated into the print document. Customer logo space is shared;
previews overlay the existing HTTPS brand logo within that exact box. The
server supplies a separately validated PNG/JPEG data URI in the same box.
Server-side asset loading/decoding is a separate boundary and must reject
untrusted locations or oversized/invalid images before rasterization. SVG
layout data is not authorization to read an order, enqueue a job or print.

The visually hidden text transcript keeps receipt contents accessible while
visible previews use the actual vector layout. Tests check physical minimum
sizes, 58/80 mm bounds, long content, settings, cancellation, XML escaping,
category/menu content, seller totals and external-image exclusion. Browser
checks inspect the actual SVG at mobile widths and capture layout artifacts.
