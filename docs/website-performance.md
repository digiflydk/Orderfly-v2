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

## Second delivery pass after public mobile71

The official public report created29October2026 at02:09CET measured71, LCP6.4s,
FCP2.2s, TBT30ms and CLS0 on release8e4cde4a. This improved on62/LCP10.8s but
has not met the90 target. The report identifies render-blocking CSS/scripts,
281KiB of avoidable image delivery and the Club artwork as LCP.

The homepage now embeds the exact two pinned stylesheet bytes instead of making
render-blocking stylesheet roundtrips. Their font/image URLs are already absolute
`/_assets/` paths, so document-base resolution is unchanged. The existing source
CSS routes remain available and every deep HTML page is unchanged. Only the three
legacy body script tags defer, in their original order: the independent loader,
jQuery, then Webflow. Inline consumers use DOMContentLoaded or idle callbacks.
The consent bootstrap stays first and synchronous in the head, with optional
providers denied by default. No provider, CSP, authentication or contact activation
rule changes.

A regression holds all legacy runtime and stylesheet responses and checks that the
real hero paints while those responses remain pending. It also proves that the
native mobile `details` navigation opens and closes before runtime is released.
The same test then releases scripts, exercises both carousel directions, checks
list/listitem semantics after Swiper initialization, checks absence of console
errors and confirms no horizontal overflow. Mobile arrows have a separate60px
control row, with44px targets outside the signup CTA both before and after
initialization. Desktop arrow positioning is retained. The two inline arrow SVGs
now have valid24px intrinsic dimensions; their existing paths are unchanged.

Thirty content-addressed responsive derivatives come from the existing ten
photographs and one logo, using the repository's Sharp version. Original assets
remain byte-identical for deep pages, existing URLs and metadata. Homepage images
have intrinsic width/height, srcset and sizes. The mobile brunch candidate is9,916
bytes compared with189,751 bytes for the original JPEG; a1024px Club AVIF is57,351
bytes compared with151,420 bytes for the original artwork. These file sizes are
not a public performance score or a visual-quality guarantee. Desktop/mobile
screenshots are inspected before release. No text, prices, dates, legal identity,
links or image framing is changed.

`scripts/preview-performance-90.cjs` applies this delivery pass to its unpatched
base payload and records provenance/dimensions in the manifest. It fails if the
homepage already contains the pass. `website-home-delivery-baseline.json` pins all
376base routes; tests require every original route except `/` to retain exact
bytes and permit only the30declared derivatives. Total inventory is406routes,
including104HTMLpages. Rebuilding the original historical source archive alone
still requires the earlier documented migration/consent/performance patches too.

Public mobile90+ must be measured again after coordinator release. Isolated
first-paint timings, passing local tests and these byte reductions do not establish
that public goal.
