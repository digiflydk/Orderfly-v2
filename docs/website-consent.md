# Website consent correction — Website #47

This is an intentional correction to captured source behavior, not a claim that
hosting introduced the defects. The 104 captured pages eagerly requested Meta
and GTM, six also eagerly requested Omnisend, and Meta's noscript pixel bypassed
JavaScript consent. The shared reject-all handler read already checked boxes;
deferred marketing work could also run after a subsequent rejection.

`scripts/preview-consent.py` removes only four exact hash-pinned script variants
and the exact Meta noscript pixel. It preserves the unrelated booking noscript,
canonical/SEO markup, existing Club promotion, all original assets and the CTA/
Swiper function bodies. The old shared script's consent owner is replaced by one
local `/_assets/website-consent.js` loaded first in the head. The retained UI
fragment is separately tracked in `scripts/website-ui-preserved.html`.

The original v8 source manifest and all source page hashes remain immutable.
Each page records `consent_patch_version:1` and its removed eager Omnisend count.
The manifest explicitly records the new asset and all transformed output hashes.
There are 376 packaged routes:104HTML,269original assets,contact adapter,consent
adapter and robots. The original269 assets and existing contact adapter retain
their bytes. The contact form remains disabled pending its separate activation.

## Behavior

* Optional Google consent defaults to denied before any provider load; only
  functionality/security default to granted. Existing `fa-consent-*` cookies
  retain their names, secure flag, lifetime and path.
* No optional provider is requested before an explicit valid saved/new choice.
  Only the exact HTTPS apex/www public origins may load them; preview and unknown
  origins stay offline even with saved grants.
* Marketing permits the existing Meta pixel773544982454626 and Omnisend
  brand69618ede8284682be9bb5290. Each loader and page-view initialization runs
  once per document. Reject-all clears all optional categories regardless of
  checked settings; accept-selected reads the categories individually.
* Deferred tasks are cancelled on a changed choice and recheck consent before
  loading. Revoking a category after its provider loaded persists denial and
  reloads to discard vendor runtimes; denied providers are absent in the next
  document. Already sent/in-flight requests cannot be undone. No vendor cookies
  or server data are deleted by this change.
* Newsletter has a visible settings/fallback message without marketing consent
  and loading feedback until a visible, enabled email field exists in the exact
  embedded mount. A MutationObserver rechecks downstream rendering. A 10-second
  deadline or launcher error retains an accessible failure message; late rendering
  can recover it. A hidden field or merely successful launcher never hides it.
  No subscription
  is submitted by the adapter or tests.

## Google configuration gate — not complete

The existing published GTM-52G3QF76 container initializes GA4 G-F9XCDW2586 and
Google Ads AW-17906276961, including a conversion linker. Consent-denied Ads can
still request resources; default denied storage alone is not a guarantee of
no marketing traffic. Therefore this candidate conservatively loads the mixed
container only when **both analytics and marketing are granted**. Analytics-only
choice is saved but does not load Google. Marketing-only loads Meta/Omnisend but
not the mixed container. The existing Club script already checks production
host and analytics cookie; its source bytes remain unchanged.

This is a fail-closed interim condition, not completed independent Google
analytics support. The coordinator must settle and verify the actual published
container's category/trigger configuration and deduplication, including Ads and
cross-domain behavior, before marking tracking ready. There is no new direct GA4
loader, no invented provider identifier, and no GTM publication in this PR.
The separately owned public CSP change is also a prerequisite for live provider
delivery. Omnisend dynamic dependencies must be established through controlled
provider QA; do not broaden origins without evidence.

## Validation and release hold

### Combined post-cutover correction, 2026-10-28

The combined candidate includes the bounded CSP correction and current main
`fae11880`. Real intercepted browser tests at 390px and 1440px found the sticky
cookie control underneath the mobile booking bar. A scoped mobile style now
places it above that bar. The tests use the captured HTML/assets and production
CSP with every external request intercepted: initial denial, rejection,
marketing-only selection, revocation/reload, repeated acceptance and visible
newsletter fallback pass. No test events or subscriptions reach providers.

The public site was separately activated in Firebase on `fae11880`; this patch
repairs its consent behavior and is not a declaration that all provider or
contact prerequisites have been resolved. Google category separation and
Omnisend downstream dependencies remain the explicit limitations below.

Isolated VM tests replace timers, cookies and script insertion; no vendor code,
requests, events or subscribers are created. Cases cover initial denial,
checked-box rejection, separate categories, duplicate acceptance, saved choices,
queued cancellation, loaded revocation/revisit, malformed state, preview hosts
and provider-load failure. Payload checks inspect all104 emitted pages and
validate asset pins and preserved UI. These are not actual browser/provider
acceptance. Production build and local Next HTTP verify delivery separately.

Root browser checks still needed: real cookie controls and stored revisit on
HTTPS; every category combination and rapid accept/reject; revoke/reload;
newsletter fallback and mocked provider failure; one request/initialization per
provider; no requests before consent; keyboard/mobile layout; original Club,
CTA/Swiper and booking behavior. Use an explicit local origin-only fixture with
script requests mocked if necessary and record that equivalence gap. Real GTM/
Meta/Omnisend event delivery, Ads/category policy, CSP provider configuration and
account-side results remain distinct gates. No full tracking readiness, merge,
deployment, DNS, secrets, provider writes or Actions are implied.

## Orderfly GTM container GTM-PK4J8ZFD on the website (2026-11-10)

PO decision: the website keeps the existing container **and** adds the Orderfly
container `GTM-PK4J8ZFD`, loaded by the same consent owner (not an eager `<head>`
snippet, which would bypass the cookie banner from #47).

* (Superseded 2026-11-10, see "GTM owns GA4 and Google Ads" below.) Both containers loaded only when statistics **and** marketing were granted, on the
  exact public origins only. [Tracking isolation](orderfly-tracking-isolation.md)
  describes `GTM-PK4J8ZFD` as GA4 `G-551JD0H72K` only, but on 2026-11-10 the published
  container requested `ad.doubleclick.net` and `www.google.com` (Google Ads) in the
  `vendor-tracking-browser` CI fixture. Like `GTM-52G3QF76` (GA4 `G-F9XCDW2586` +
  Google Ads), it is therefore treated as a marketing container. Version 1 of this
  change, which loaded it on statistics alone, was never merged.
* Analytics-only choices are saved but load neither container.
* Both containers share one `dataLayer`. `gtag('js', new Date())` and the
  `gtm.js` start event are pushed once per document, so a container loaded later
  reads the same start event and page views are not doubled.
* Revoking statistics after either container loaded persists denial and reloads.
* The CSP already allows `https://www.googletagmanager.com` and GA4 `/g/collect`;
  no new origin is added.

Payload change: `scripts/preview-gtm-orderfly.cjs` (apply once per version; records
`manifest.gtm_orderfly`, now version 2) replaces `/_assets/website-consent.js` and the inline copy
on `/`, and updates the pinned hashes. Tests: `tests/unit/website-consent.cjs`,
`tests/unit/website-consent-browser.cjs`, `tests/unit/website-consent-payload.cjs`,
`tests/unit/website-critical-bootstrap.cjs`.

Live check after deployment (read-only): fresh visit loads no GTM; statistics only
loads no GTM; accept all loads both once; GA4 realtime for
`G-551JD0H72K` shows the visit. Website traffic will now appear in the Orderfly GA4
property, alongside the webshop.

## GTM owns GA4 and Google Ads (2026-11-10)

PO decision: Google Ads is managed in GTM, on the website and in the webshop.

* Both containers (`GTM-52G3QF76`, `GTM-PK4J8ZFD`) load when statistics **or** marketing is granted, once per document, on the exact public origins only. Nothing loads before a choice.
* Consent Mode v2 tells their tags exactly what was granted: `analytics_storage` follows statistics; `ad_storage`, `ad_user_data` and `ad_personalization` follow marketing.
* **The GTM configuration must enforce this.** GA4 tags require `analytics_storage`. Google Ads tags, remarketing and the conversion linker require `ad_storage` (GTM: Consent settings → Require additional consent). Without that, a statistics-only visitor can trigger Ads requests. This is configured by the Google consultant in GTM, not in this repository.
* Revoking statistics or marketing after a container loaded persists the denial and reloads; the next document loads GTM again only if one purpose is still granted.
* Analytics-only no longer stays saved-but-idle: it loads both containers with Ads storage denied. Marketing-only loads Meta, Omnisend and both containers with analytics storage denied.
* The website CSP allows the Google Ads hosts from Google's CSP guide (see [tracking policy](website-tracking-policy.md)).
* Payload: `scripts/preview-gtm-orderfly.cjs` version 3.

## GTM-52G3QF76 retired (2026-11-11)

The Google consultant moved everything needed into `GTM-PK4J8ZFD` (one Google Ads tag `AW-17906276961`, no double tracking) and published it. The website now loads only `GTM-PK4J8ZFD`, for statistics or marketing, with Consent Mode as above. The homepage Club promotion now pushes plain GA4 ecommerce `view_promotion` / `select_promotion` events to the dataLayer instead of `gtag('event', …, {send_to: 'G-F9XCDW2586'})` (see [Club homepage](stempelkort/esmeralda-homepage-club.md)). Payload: `scripts/preview-gtm-orderfly.cjs` version 4, using `scripts/website-club-promo-gtm.cjs`; baseline tests reverse that exact change through `tests/helpers/website-gtm-orderfly-baseline.cjs`.
