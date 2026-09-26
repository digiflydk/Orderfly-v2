# Shared administration design (#163)

Orderfly and Opsfly use a neutral, Wolt-inspired administration interface for all brands. The design is scoped to the authenticated admin shell; storefronts and the Esmeralda employee portal keep their own visual identity.

| Element | Shared rule |
| --- | --- |
| Canvas / surface / text | `#F7F9FB` / `#FFFFFF` / `#17232E` |
| Sidebar / hover / active | `#142634` / `#213849` / `#1F495E`, with a cyan active marker |
| Primary / foreground / focus | `#0A789C` / white / `#0A789C` |
| Secondary / destructive | White with neutral border / outlined error action |
| Typography | Inter if available, then system sans; sentence-case headings, clear 12px table labels |
| Buttons / controls | 40px height and 8px radius; Lucide icons in the sidebar and actions |
| Dates | `AdminDateRange` gives labelled from/to fields and accepts localized labels. The consuming page applies its existing validation and submission behavior. |
| Dropdowns | `AdminSelectField` for simple native filters, Radix `Select` for searchable/complex controls; both use the same field tokens and focus treatment. |
| Tables | Shared `Table` primitives with one column header row, soft row borders and horizontal scroll on narrow screens. |

The tokens live in `src/styles/admin-ui.css` and are applied only by `src/app/superadmin/layout.tsx` through `.admin-shell`. `src/components/superadmin/admin-date-range.tsx` and `admin-select-field.tsx` hold reusable filter controls. Existing server authorization, brand ownership and order/product data behavior are unchanged. Compare the corresponding Opsfly rules in its `docs/ui-ux-standards.md` before changing either palette.

The `/superadmin` overview counts the brands and locations in the selected filter and shows only destinations allowed by the current user's display permissions. `/superadmin/dashboard` remains the existing sales KPI page and is listed for users with `orderfly.analytics:view`.

Review `/superadmin`, `/superadmin/dashboard`, `/superadmin/sales/orders` and `/superadmin/products` on desktop and narrow mobile screens before accepting the change. Do not merge or deploy until normal CI, review and PO acceptance complete.
