# QR logo and print controls (#431 / #398 / #389)

Candidate component only. `QrPrintTools` receives `{draft, context, render}`.
The parent supplies the current authorized draft and stored ID/revision, renders
it only for an export-capable user, and binds `render` to the authenticated server
QR renderer. No arbitrary HTML provider or remote asset URL is supported.

The component selects a local PNG/JPEG of at most 2 MB, checks the raster signature
and sends base64 without a data-URL prefix. Actual dimensions, image decoding,
compression limits and QR readability remain mandatory server checks. Selecting
a logo forces H correction in a copied export draft without mutating saved style.
The logo is ephemeral: no localStorage, sessionStorage or cookie is written, no
logo enters the catalogue/save API, and scope changes/unmount discard it. The UI
explains that the logo is not saved and must be selected again for another export.

`render(draft, context, {logoBase64?, format})` resolves
`{content, mime, encoding?, filename}`. PNG uses base64 and `image/png`; SVG uses
UTF-8 and `image/svg+xml`; print uses trusted `qrPrintHtml` HTML and `text/html`.
The parent API revalidates action-specific permission, current brand/location and
revision. Unsaved dynamic codes cannot export because there is no permanent link.
Download responses become local Blob URLs; filenames are bounded and path/control
characters replaced. URLs are revoked after download or on unmount/scope change.

Print synchronously preopens a blank window from the user's click and immediately
severs `opener`. After a successful trusted HTML response, it navigates to a local
Blob URL without `document.write`. Blocked popups show a retryable explanation
before the render call. Failed or unsafe output closes the pending window. The
server print document's restrictive CSP is required; callback guards are not a
general-purpose HTML sanitizer. Blob URLs expire after two minutes or on unmount.
The user then chooses browser Print / Save as PDF. No direct PDF file download or
automatic successful physical print is claimed.

`tests/unit/qr-print-tools-browser.cjs` renders the actual component in Chromium
at 390/1440 px with an intercepted callback. It checks payload/context/H-copy,
PNG/SVG downloads and URL cleanup, invalid/oversized logos, removal/scope reset,
absence of storage, actual popup/opener/blob navigation, blocked popup, unsafe
HTML, unsaved dynamic code and pending/failure states. This is isolated component
QA, not complete application styling, authenticated server authorization, real
image/QR decode, live production acceptance or iPhone/Android printed-scan proof.
Root owns manager/workspace wiring, HTTP bounds and shared CI inventory.
