# Public website tracking policy (#24 / #47)

This is a bounded CSP repair for **esmeraldapizza.dk**, not Orderfly merchant tracking. Base main `7a5a2fb40ae593783b616cee92ccc5b239745a99`. Consent/payload changes belong to the separate #47 agent. The production release switch stays disabled; no deployment, provider configuration, event, subscription, secret, DNS or production-data change is made here.

## Source inventory

The captured104-page website payload SHA256 `abf960936b1e791fdab8b7bfaae64fa5600136cec040a8bf7c6536b4286cca2b` contains GTM `GTM-52G3QF76` and Meta pixel `773544982454626` on104pages. Homepage Club measurement targets website GA4 `G-F9XCDW2586`; no merchant property is substituted. The captured Meta loader runs early with revoked consent and queued PageView; captured GTM starts without waiting for consent. Those payload defects are owned by #47, not fixed by allowing network sources.

Read-only retrieval on2026-10-28 of the exact public GTM container returned resource version22. Its13tags include GA4 configuration, `analytics_consent_granted`, `order_click`, `booking_click`, booking widget events, conversion linker20 and **Google Ads AW-17906276961**. The `gtm.init` rule adds GA4tag5, conversionlinker20 and AdsGoogleTag23. The linker enables cross-domain linking to `dully.io, esmeraldapizza.dk` and URL passthrough. Consent-init template22 reads `fa-consent-*` cookies and sets optional states denied absent grants. This is source inspection, not runtime execution or account receipt. Hashes/structured inventory are in `website-tracking-evidence.json`; downloaded copyrighted SDK bodies are not committed.

## Added permission and evidence

| CSP directive/source | Evidence and boundary |
| --- | --- |
| script/img/connect `https://www.googletagmanager.com` | Google's official CSP guide specifies this exact origin for GTM. A loader-path-only policy prevented Google tag/destination scripts under the same origin. No Tag Assistant/debug origin allowed. |
| connect `https://www.google.com` | Official GTM baseline requirement; this is shared infrastructure and must **not** be called an Ads-blocking boundary. |
| img/connect `https://www.google-analytics.com/g/collect` and `https://region1.google-analytics.com/g/collect` | Retrieved website container/GA SDK construct `/g/collect` using configured region1 (DK/DK-83), with www fallback. Only these concrete hosts/path are added, not all Analytics subdomains. |
| script `https://connect.facebook.net/signals/config/773544982454626` | Retrieved Meta SDK constructs its per-pixel configuration script under this exact path. The captured website pixel identifies the only permitted ID. |
| img `https://www.facebook.com/tr/` and connect same | Retrieved Meta SDK defines this beacon endpoint and uses sendBeacon. Existing noscript `/tr` image permission remains. No general Facebook/Instagram/network wildcard added. |

Official primary references checked2026-10-28: [Google CSP guide](https://developers.google.com/tag-platform/security/guides/csp) (updated2026-09-18) and [Google consent-mode overview](https://developers.google.com/tag-platform/security/concepts/consent-mode). Google distinguishes blocking tags until consent from loading them with denied storage: the latter can send cookieless measurements. Therefore denied flags alone cannot establish no network traffic. Meta documentation retrieval was unavailable; Meta endpoint findings above come from the actual public SDK body, not third-party documentation.

## Concrete unresolved release gates

1. **Mixed Google categories.** Loading this GTM container on analytics-only consent also initializes Ads/linker tags. No known evidence yet proves the desired category-specific network boundary or appropriate link decoration. Root/#47 must verify or explicitly configure the published container and test denied, analytics-only, marketing-only, combined and revoked choices. No remote configuration changed here. CSP is not a consent manager.
2. **Dynamic destinations.** Ads-specific domains, country-specific Google domains, alternative GA collection destinations, Meta plugin/config-driven endpoints and Omnisend downstream assets/API remain unapproved. The SDKs contain optional paths; their presence alone does not justify allowing every endpoint. No wildcard is added. A successfully loaded SDK is not complete tracking acceptance.
3. **Provider/browser proof.** Root must observe actual resource requests and CSP violations on an authorized host, confirm IDs and one-event behavior after the selected consent, and verify revocation. Provider receipt/dedup is separate from command queues and HTTP200 script retrieval. No events were submitted during this investigation.
4. **Omnisend.** Prior #24 account-read evidence confirms embedded form configuration, not dynamic origin inventory. Prior launcher403 is not retried here. Existing homepage documentation also records a competing-popup/manual-trigger release step; inspect actual provider settings/behavior before claiming only one popup.

Existing preview CSP remains offline/noindex. Public booking/contact permissions remain path-scoped. mPanel policy and merchant code are untouched. Existing unsafe-inline/eval allowances are unchanged; this PR does not claim a nonce migration. No new CSP reporting endpoint is introduced.

## Verification and ownership

`node --test tests/unit/website-tracking-policy.cjs tests/unit/esmeralda-public-host.cjs` checks exact directives, rejected unapproved origins, preview isolation, route scopes and disabled release default. `npm run typecheck` is required. These are local code checks, not browser or service acceptance. Independent current-head review and root's serial release gates remain required. #24 stays blocked on the named runtime/provider/consent conditions even if this bounded code PR passes review.
