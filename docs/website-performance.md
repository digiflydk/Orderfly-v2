# Website mobile performance follow-up

The migrated homepage constructed its final campaign order after DOMContentLoaded,
marked the eventual first hero image lazy/low priority, loaded carousel layout
asynchronously and rotated content automatically after three seconds. This delayed
useful paint and replaced the largest visible element during initial loading.

The captured HTML now starts with the same final Club then brunch order produced
by the existing scripts. Campaign prices, dates, copy, legal identity and links are
preserved. The first Club artwork is eager/high priority. Small scoped layout rules
reserve the horizontal carousel before its library loads. Autoplay is disabled;
manual previous/next, pagination and swipe remain. Mobile previous/next controls
are visible44px targets. A real browser regression exercises next via an ordinary
click and verifies stable first slide, next campaign and no horizontal overflow.

All104cookie settings forms are owned by the local consent adapter and never submit
to Webflow. Their stale exported data-turnstile-sitekey attributes caused Webflow's
forms module to access an absent turnstile global on the menu page. Removing only
those attributes fixes that error. The real contact adapter's own CAPTCHA guard,
backend validation and disabled activation remain intact. No blanket script-error
suppression or fake CAPTCHA object is introduced.

The existing route adapter negotiates gzip for website text responses only, with
correct Content-Length and Vary:Accept-Encoding. Unsupported/disabled gzip keeps
identity bytes; images are untouched. Host boundaries, consent gating, CSP, route
inventory, authentication and production activation switches remain unchanged.

## Verification boundary

The previous local worktree was lost to transient storage cleanup. This candidate
reconstructs the changes on current main rather than claiming a surviving agent or
commit. Tests are rerun against this candidate. Unit tests pin all payload entries
and verify encoding negotiation; browser tests intercept every provider and use
synthetic requests only. Existing consent tests must also pass.

The last supplied public PageSpeed mobile result remains62/LCP10.8s (28October2026).
A fresh unauthenticated PageSpeed API request on29October2026 returned429
RESOURCE_EXHAUSTED; it did not produce a measurement. Historical localhost
Lighthouse results are not public PageSpeed evidence. This candidate does not claim
90+. After exact-head build/review and coordinator-controlled serial deployment,
verify the release SHA, representative public pages, cookie/hero/menu behavior,
then obtain a new public mobile PageSpeed report. Continue optimization until90+
is documented. No deployment or live acceptance is implied by local passing tests.
