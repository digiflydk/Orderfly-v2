
# Brand Website Module - API Map

### CMS API Map (Superadmin Actions)
*   `saveBrandWebsiteConfig`: Saves domain and status settings.
*   `saveBrandWebsiteDesignSystem`: Saves colors and typography.
*   `saveBrandWebsiteSeo`: Saves SEO metadata.
*   `saveBrandWebsiteHome`: Saves all homepage section content.
*   `listBrandWebsitePages`, `getBrandWebsitePage`, `createOrUpdateBrandWebsitePage`, `deleteBrandWebsitePage`: CRUD for static pages.
*   `saveBrandWebsiteMenuSettings`: Saves menu display preferences.

### Public Website API Map (Read-Only)
*   `resolveBrandByDomain(hostname)`: Returns brand ID for a domain.
*   `getPublicBrandWebsiteConfig(brandId)`: Returns website configuration.
*   `getPublicBrandWebsiteHome(brandId)`: Returns all homepage content.
*   `getPublicBrandWebsitePages(brandId)`: Returns a list of pages.
*   `getPublicBrandWebsitePageBySlug`: Returns a single page.
*   `getPublicBrandWebsiteMenuSettings(brandId)`: Returns menu display settings.
*   `getPublicBrandMenuData(brandId)`: Returns menu product/category data.
*   `getPublicBrandLocationData(brandId)`: Returns location data.
