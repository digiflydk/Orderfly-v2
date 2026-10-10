# Orderfly Website cleanup (#223)

Orderfly Website was a separate marketing CMS, not the native takeaway website. Its page, header/footer, design, customer-logo, lead, AI prompt, general, SEO, social and tracking editors are removed, together with their server actions, global settings service/types, unused sections, archived public pages and duplicate marketing layout wrappers. The lead-saving endpoint and disabled AI qualification UI are removed. Menu-import AI remains.

The native brand layout no longer reads `settings/general` or sends it to client components. Restaurant-selector navigation uses the current brand's name/logo and `/{brandSlug}` ordering link, including the mobile menu. The old marketing navigation could point to unrelated anchors or another brand's entry point. Native menu, cart, checkout, payments, analytics and brand appearances continue to use their existing configuration.

## Compatibility and access

- `/superadmin/website` and its old subpaths require platform-superuser authorization before redirecting to `/superadmin/settings`.
- `/superadmin/website/settings/cookie-texts` redirects to `/superadmin/settings/cookie-texts`. The canonical editor is listed under System → Cookies and remains restricted to platform superusers.
- `/features`, `/pricing` and `/contact` redirect to `/`, the existing standard takeaway entry point. The old contact form only logged its values and displayed success without sending a message; it is removed.
- `orderfly.website` permissions remain because native storefront overview and games still use them.
- `platform_settings`, cookie texts/consent, payment configuration and native customer/order records are preserved. Deprecated global marketing documents are excluded from the debug-all payload.

## Data retention

No production records are changed or deleted. Historical `settings/general`, leads and uploaded marketing media remain in storage for a separately scoped retention decision. They no longer have marketing read/write actions or storefront rendering consumers. This is code retirement, not a claim that historical database data has been erased.

## Validation and release

Run typecheck and production build. The endpoint audit executes compatibility redirects with rejected and authorized access; the layout-boundary test prevents reintroducing a global settings dependency. The real-component Playwright fixtures exercise brand-local links with and without a logo, desktop/mobile navigation, Escape handling and narrow-screen overflow. Admin-shell tests check scoped-user restrictions and superuser cookie navigation. Existing landing tests still navigate into the native menu.

Changes go through PR, independent CI/review and PO acceptance before merge. Production rollout and read-only live verification remain separate gates. Live checks should cover root landing, brand selector, a native restaurant menu, retired public redirects and authenticated System → Cookies. Do not create orders, payments or production settings during unattended verification.

Local verification: 30 unit/access/consent checks passed (endpoint audit, settings access, layout boundary, cookie management, navigation and website access); 12 actual-component Playwright checks passed (six landing/website/brand-header checks and six admin overview/shell checks). The upsell audit fixture now stubs the `server-only` marker, matching its server-action execution context without changing its no-write assertion. CI includes the new boundary/access tests. No live verification is claimed by these local fixtures.
