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
  and an honest failure message if its provider script fails. No subscription
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
