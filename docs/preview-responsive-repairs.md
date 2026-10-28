# Captured responsive repairs (Website #65, parent #27)

Read-only browser DOM checks on the reviewed candidate found horizontal overflow
at 390px on the two policy pages and product listing. The policy rich-text
headings have fixed widths and long unbreakable words. The product grid's mobile
`1fr` track retains an automatic intrinsic minimum. The Tiramisu hero also forces
a CMS-empty image with no `src` to display. These elements already exist in the
original captured payload; the new hosting code did not introduce them.

`scripts/preview-responsive.py` applies only four explicit route patches, after
the existing navigation/contact transforms and original source verification:

* `/handelsbetingelser` and `/privatlivspolitik`: below 768px only, rich-text
  headings inside `.section_policy .about_text` allow long words to wrap and
  cannot exceed their container width. Text, heading tags and desktop rules stay.
* `/produkter`: below 768px only, the product grid uses `minmax(0,1fr)` and its
  items use `min-width:0`; card titles may wrap. Existing overflow clipping is
  unchanged, and the existing deliberate ESMERALDA fallback on the empty
  Tiramisu listing card remains intact.
* `/produkter/tiramisu`: only the exact captured empty hero image becomes the
  honest text “Produktbillede ikke tilgængeligt”. No unrelated food photo or
  invented product asset is used. The exact expected image must occur once.

The obsolete `.hide.w-nav` is intentionally hidden in the source. The current
navigation is the native `details.es-header-v2__mobile-menu` and its
`summary[aria-label="Åbn menu"]`; this change does not modify either navbar.

The original v8 manifest SHA, input page hashes and all 270 packaged assets
(269 original plus contact adapter) are preserved. `page_patches` adds
`responsive_patch_version:1` on only those four routes and
`empty_image_fallbacks:1` on Tiramisu. `routes` and `payload_sha256` record the
transformed bytes. All existing scripts, links, metadata, canonical tags and
remaining 100 HTML pages retain their prior bytes.

Validation separates deterministic packaging/unit checks, local Next HTTP,
browser DOM dimensions, visual/browser interaction and live acceptance. Mobile
fix acceptance requires rechecking the affected pages at 390, 820 and 1440px;
312 initial DOM measurements are not 312 visual approvals. Lazy images that
have not loaded are not considered passed. No deployment, DNS or provider
activation is authorized by this patch or its tests.

Recorded output hashes:

| Route | SHA256 |
|---|---|
| `/handelsbetingelser` | `6e3d34d8fa360c7370eacae776a6f2058e9eb052008aca96c7feb7696686eca7` |
| `/privatlivspolitik` | `6720359e2bb08ae375cc892770e4670f9ef69eb645b4c4dcebcb477ebc55e12a` |
| `/produkter` | `010b07c8df5902f2c184ab015ca214dc0376b3146693ae4743c437d57edaa135` |
| `/produkter/tiramisu` | `078fb59714fd65051cdd362a4482a8b05a2e6ff5fb22cc30a88b703b1fe88c41` |

Compressed payload SHA256: `abf960936b1e791fdab8b7bfaae64fa5600136cec040a8bf7c6536b4286cca2b`.
