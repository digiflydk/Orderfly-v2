# Ordering SEO

The 6 November live audit on `/amager` reproduced Lighthouse12 SEO82. The only failing audits were meta-description and robots-txt. The description existed in BODY after asynchronous metadata streaming, while robots declared a relative sitemap URL. The sitemap itself was empty.

Location menu metadata now supplies a location-specific title and description, a stable HTTPS brand-subdomain canonical without query parameters, and matching Open Graph/Twitter descriptions. Invalid, suspended, inactive or cross-brand metadata requests are not indexable. No restaurant address, ratings or opening hours are invented for structured data.

Metadata streaming is disabled for all user agents through Next's documented htmlLimitedBots setting, so metadata is placed in HEAD consistently rather than treating Lighthouse specially. This application-wide metadata-delivery setting can affect first-response timing; repeat production performance measurements after release. It does not change App Hosting infrastructure/cache settings.

Robots advertises an absolute sitemap URL from the validated brand hostname. Unknown hosts use the fixed platform origin rather than reflecting an arbitrary Host header. Brand sitemaps query only the resolved brand's locations and include its landing page and active, owned menu routes. No checkout, confirmation, account or other tenant routes are listed. Suspended/missing brands return404. Platform sitemap includes its root. Existing index/access protections are unchanged.

Validation: typecheck, SEO route unit tests (scope, inactive/suspended, XML, canonical), relevant storefront browser tests, production build, exact-head independent review, then live head/robots/sitemap verification and Lighthouse SEO. Re-measure performance with the existing mobile lab settings. Do not claim 100 before the live audit. Lighthouse100 is a technical checklist result, not a promise of ranking or comprehensive SEO perfection.

Release is PM-authorized; use existing [skip ci] guards and local checks, never GitHub Actions. No secrets, production data, payment code, Firestore rules or apphosting.yaml changes. The user-facing report must contain readable findings and results, not only a raw Lighthouse HTML app.

Independent review identified location slugs that collide with the brand or app-wide paths. Metadata and sitemap now both use storefrontPath, preserving the required prefix for supported names such as esmeralda and feedback. Regression tests cover both cases.
