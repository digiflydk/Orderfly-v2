# Superadmin navigation polish (#225)

The sidebar starts with only the Dashboard group open, exposing Dashboard and Salgsoverblik. All other groups and nested menus start collapsed, including when loading a deep link. Users can expand/collapse them manually; their choice remains while the shared layout stays mounted. A fresh load restores the compact defaults. Expand controls expose their current state through `aria-expanded`.

The former Overblik navigation label, group title and overview page heading are named Dashboard. Destinations and access filtering are unchanged. The sidebar Orderfly logo occupies 85% of its previous available width, with 20px top/bottom padding and an additional gap before Dashboard. The central-admin Platform shortcut to mPanel users/roles is removed; mPanel remains responsible for that administration.

The supplied 32px transparent black Orderfly PNG is copied unchanged to the root App Router `icon.png` asset. Next.js generates the favicon metadata and serves the icon; the old generic `favicon.ico` is removed to avoid competing icons. This applies to the site, including Superadmin. No branding database record, permissions, menu data or order records are changed.

Validation: TypeScript check, production build, and real-component desktop/mobile browser checks. Browser checks cover initial collapsed groups, manual group and nested-menu toggling, access restrictions, retained cookie navigation, removed Platform shortcut, 85% logo width, vertical spacing, overflow and the existing overview visual baseline. Merge requires independent CI/review and PO acceptance; deployment/live verification is a separate release step.
