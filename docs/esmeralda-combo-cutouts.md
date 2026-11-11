# Esmeralda combo photographs

The Pizzamenu currently visible on the Amager storefront uses a transparent cutout of its existing pizza and Pepsi photograph. Full and 192px WebP assets use square transparent canvases so the complete meal fits the menu card. The source file in Firestore is retained.

`esmeraldaComboImage` requires V2, the Esmeralda brand, the exact combo ID and the original photograph URL (ignoring token rotation). A later photograph upload falls back to the new catalog image. Both assets are explicitly allowed by subdomain routing.

Inventory on 2026-11-11: one standalone combo/menu photograph in the public Amager menu. Product images inside combo choices retain their existing cutouts.

Asset preparation: image generation background extraction, then WebP encoding with alpha and contain resizing. No production data changes.

The Combo administration form and server validator also accept the exact bundled `/images/esmeralda-v2/menu/combo-pizzamenu.webp` path, so the cutout can be saved as the canonical combo image. Other local paths are not admitted.
