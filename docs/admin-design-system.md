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

The tokens live in `src/styles/admin-ui.css` and are applied on admin routes by `src/app/superadmin/layout.tsx` through `.admin-shell`. Its HSL values reproduce the shared Opsfly hex palette in rendered Tailwind controls. When that shell is present, the document body receives the same tokens so Radix dialogs, menus and selects rendered in a body-level portal inherit the admin palette and typography. Storefront routes retain their own tokens. Sidebar destinations use 20px outline icons, 10px icon/label spacing and 16px bold labels like Opsfly. Logout lives at the bottom of the sidebar, including the mobile menu, so the mobile header has one row. `src/components/superadmin/admin-date-range.tsx` and `admin-select-field.tsx` hold reusable filter controls. The mobile logo links to `/superadmin`, which is available to delegated administrators with any Orderfly view permission. Existing server authorization, brand ownership and order/product data behavior are unchanged. Compare the corresponding Opsfly rules in its `docs/ui-ux-standards.md` before changing either palette.

The `/superadmin` overview counts the brands and locations in the selected filter, including the brand implied by a selected location, and shows only destinations allowed by the current user's display permissions. Its selector uses the union of the current user's independently authorized view scopes, so an orders-only user does not need analytics permission to see the overview. A platform superuser uses the full native catalogue. `/superadmin/dashboard` is listed for users with `orderfly.analytics:view`; it presents only order-derived sales KPIs so every card follows the same date, brand and multi-location selection. Current brand/location inventory remains on the overview, while customer, feedback and cookie-consent metrics remain in their dedicated reports; those records cannot consistently be attributed to the sales dashboard's date and location filters. Sales filter choices on both sales routes use the analytics-specific native catalogue rather than the union of unrelated feature grants. Deselecting the last location emits an empty selection and removes the location constraint from the KPI query. Choosing a different brand clears selected locations outside that brand.

Review `/superadmin`, `/superadmin/dashboard`, `/superadmin/sales/orders` and `/superadmin/products` on desktop and narrow mobile screens before accepting the change. Do not merge or deploy until normal CI, review and PO acceptance complete.

The overview's desktop and 390px mobile browser screenshots are compared in CI against approved, downsampled RGB baselines in `tests/visual-baselines/`. The baseline comes from the visually reviewed Orderfly CI run 36242305336 (artifact 10906671772, head `b95a581`); update it only after reviewing the new screenshots. A second browser fixture renders the actual administration sidebar and mobile header around that overview, checks that there is exactly one sidebar, verifies navigation icons and overflow, and uploads screenshots for visual review. Private data and real session behavior still require an authenticated preview.
