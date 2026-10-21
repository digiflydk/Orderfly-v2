# Club campaign administration (#469 / #459)

Promotion → Discounts includes a Club campaign panel. Select a brand and explicitly save the settings. Loading the panel does not write configuration or activate a campaign.

The checkout selector stores exactly one mode: none, newsletter or Club. The percentage discount is still configured using the existing Promotion discount form. Welcome and profile bonuses each have their own enabled flag, stamp count and optional start/end time. Profile bonus criteria select one or more of phone, birth date and gender; “prefer not to say” is a valid gender answer. Times use the administrator browser's local time and are stored as epoch milliseconds.

An absent campaign document preserves the pre-existing newsletter checkout behavior and leaves bonus stamps disabled. An existing malformed or foreign document fails closed and cannot be silently overwritten by a default configuration. A saved `none` explicitly disables the checkout signup offer.

Both full-brand `orderfly.discounts:edit` and `orderfly.stamp_cards:settings` permissions are required to load or save this combined panel. A location-only grant or a grant to another company is insufficient. Save validates the configuration and expected version, then rechecks both permissions in the same transaction as the configuration write. A concurrent edit returns `campaign_changed`; the user can explicitly reload rather than silently losing changes. The config-only audit stores the brand, actor principal hash, time, version and enabled flags, without customer profile details.

Validation: `node --test tests/unit/loyalty-campaign-admin.cjs` covers authorization, concurrent changes, revocation, legacy defaults and corrupt configuration. `CART_CHROMIUM_PATH=... node --test tests/unit/loyalty-campaign-admin-browser.cjs` renders the actual panel against synthetic server-action responses for successful explicit saves, field validation, stale versions and access denial at mobile/desktop widths. These checks do not activate production campaigns. Deployment and controlled live acceptance remain coordinator gates.
