# Saved logos and QR patterns

QR administration stores the selected logo and pattern in the existing scoped QR
record's `design`. Use **Gem QR-kode**, then reopen the record to edit it. Preview,
thumbnail, PNG, SVG and browser print use the same server renderer and permanent
public URL. Removing the logo and saving removes it from future exports; previous
printed files and immutable audit/receipts remain intact. Existing records keep
square defaults without migration. Failed reads/writes still use native grants,
CSRF checks, revision checks and the same idempotency receipt.

## Logo requirements shown in the editor

- PNG or JPEG, maximum 2 MiB, each dimension at most 2048 pixels; no animation.
- Recommended square source of at least 256 × 256 pixels with space around the mark.
- Server re-encodes to PNG, at most 256 × 256, maximum 96 KB binary (128 KB base64).
  Highly complex images exceeding that normalized bound must be simplified.
- Preserve proportions; central logo field is 15% of QR pattern width including
  a small background pad. At 512 pixel export the field is approximately 60 pixels,
  depending on QR version and quiet zone. This is a bound, not a minimum readable
  print size. The four-module quiet zone and finder patterns stay unobstructed.
- Logo forces error correction H. Actual final image must decode to the expected
  payload before either PNG or SVG is returned. No raw source upload is persisted.

The authenticated catalogue reports truncation when its code JSON reaches 4 MB,
keeping saved raster assets within the existing browser response limit. Use scoped
catalogues for large installations; this is not a claim of server-side pagination.

## Patterns

Six module choices: square, dots, rounded, horizontal, vertical and diamond.
Timing, alignment, format and version modules retain their original square form.
Finder corners support square, rounded and extra rounded, either together or
individually for upper left/right and lower left. Corner color can follow the QR
color or use a separately contrast-checked color. Reset patterns does not remove
the selected logo or change the printed URL. No decorative choice bypasses
contrast, minimum pixel density or final decode checks.

## Verification

Renderer tests decode actual PNG and rasterized SVG with all six module patterns,
all three corner styles together, custom corner color and a persisted logo.
Native service/store tests cover normalization, save/reopen summary, same-request
replay, matching export bytes, explicit removal, unchanged slug and audit history.
Browser component tests cover file selection, save-draft propagation, patterns,
corner choices, download/preview and mobile sizing. These are isolated software
checks, not actual production writes or physical phone/print acceptance.

Editing and exporting remain separate permissions. Create/edit users can upload,
remove and save designs without export permission; their image preview uses the
existing view-authorized `preview` command. Download/print controls and server
export commands still require export permission. Catalogue byte accounting
serializes each candidate once and stops at the first row exceeding its budget,
without repeatedly serializing the whole accumulated array.

## Logo upload interaction

The logo and design panel belongs to the editor's disabled fieldset while a
logo is decoding. Pattern, corner, preview, save and cancel controls wait for the
upload to finish, preventing a design change from invalidating the pending logo
and silently leaving only the file-input name. Save actions follow the logo and
design panel so users can finish the edit where they selected the logo.
Regression coverage delays a JPEG decode, checks the interaction lock, then
saves and reopens the chosen logo and pattern. Invalid files unlock the editor
and retain their validation error.

### Explicit upload and preview feedback

Use **Upload logo** to choose a PNG/JPEG. Decoding progress and validation errors
appear beside the upload action. Only an accepted image appears as **Valgt logo**
with its filename and thumbnail; cancelling selection preserves the accepted image.
A failed replacement preserves the previous accepted logo and displays an error.
**Preview QR** includes that accepted logo and current design. Saving remains the
separate **Gem QR-kode** action. Upload completion uses a scope-specific generation
independent of preview invalidation, so a style refresh cannot silently discard it.
New drafts explicitly start with black modules (`#000000`) on white (`#ffffff`);
existing saved color choices remain intact. Tests cover the actual file-chooser
button, CMYK JPEG acceptance, preview payload, adjacent errors and style refresh
while decoding, plus black defaults in a complete workspace preview.
