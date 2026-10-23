# Esmeralda homepage Club promotion (#499)

The existing Webflow site links to the existing Orderfly membership service.
The popup is an invitation, not another signup form. Newsletter subscription alone
in Omnisend does not create a Club member or grant a welcome stamp.

## Source and destinations

- Webflow site `6a6c7110638d57d95365ad1c`, homepage `6a6c7110638d57d95365ad04`.
- Shared Navbar `2b416494-ed39-ef2c-d4cf-e87a453c4a1a`; desktop and mobile Club links.
- Shared Footer `68f8b54a-2d0c-9925-a680-5abbbf81e5e5`; permanent Club link.
- `design/esmeralda-club-homepage.html`: native homepage elements; presentation
  wrapper is placed after the existing hero section. At homepage startup the
  approved Club hero is moved into the existing Swiper wrapper as its first slide.
  The three CMS slides and their existing order remain, followed by rewind to Club.
  The three-step Club explanation stays below the rotation. Without JavaScript or
  if the existing slider is missing, the original Club content remains accessible.
- `design/esmeralda-club-homepage.css`: homepage head code, appended to existing code.
- `design/esmeralda-club-popup.js`: homepage footer code; preserves existing site code.
- Artwork `attached_assets/esmeralda-club-hero-20261022.webp`, 1536 x 1024,
  151420 bytes; managed Webflow asset `6ad9d07056ceecce9f266398`.
- Club home/login/signup/terms all use `https://esmeralda.orderfly.dk/club`.

The generated artwork deliberately contains no typography or invented logo.
Headlines, eligibility, CTA and terms are HTML using the existing Bourton/Brandon
fonts. The artwork was generated with the built-in image tool (ads-marketing):
charcoal tabletop, warmly lit stone-oven Margherita pizza, gold pizza stamp,
dark phone with eight loyalty spaces, one gold; no people, alcohol or text.
The full prompt is retained in the coordination checkpoint.

The active site rule `rules/universal-layout-and-typography.md` version2 is
applied: shared heading-style-h1 (Bourton38px/1.1), body text-size-regular
(Brandon16px/1.5), approved heading/button and padding utilities. The new hero
does not override standard heading/body font sizes. The hero is an intentional
marketing layout, not a new information page duplicating the universal component.

## Popup and Omnisend

The native `<dialog>` appears only on `/`, after twelve seconds and once the
existing cookie-choice flow has been resolved. Rejecting optional cookies does
not prevent the invitation or membership. Cookie panels and other modal dialogs
take priority. The automatic attempt stops after two minutes. Escape, close,
backdrop and "Måske senere" dismiss it; focus returns to its prior target.
`sessionStorage` remembers only the visitor's dismissal, not a tracking identity.
Without dialog support, the permanent homepage CTA remains available.

The old enabled Omnisend mobile popup `6967d0c1d3ca1cb85976fffb` is intended to
switch from immediate automatic display to manual-trigger-only when this release
is published. Its other targeting, content, consent and direct newsletter routes
must be preserved and read back. Until that step is verified, do not claim there
is no competing marketing popup. Other Omnisend forms are outside this change.
Normal Club signup still uses Orderfly's consent projection/outbox to Omnisend.

## Measurement contract

Homepage `view_promotion` (hero/popup) and `select_promotion` (CTA placement) use
the existing **website** Google property `G-F9XCDW2586`, verified in the website
GTM container `GTM-52G3QF76`; never the separate Orderfly commerce property.
Each enqueue checks current `fa-consent-analytics_storage=true`, visible tab and
the exact production website hostname. Webflow previews do not send events.
No analytics identity, contact details, member IDs, login links, QR secrets,
arbitrary current URLs or referrers are included. Payload fields are fixed:
`send_to`, `promotion_id`, `promotion_name`, `creative_slot`, canonical
`page_location` and empty `page_referrer`. Hero impressions require half of the
viewport/hero to be in view and enqueue at most once in that page view.
Visibility is checked horizontally as well as vertically so an offscreen Club
slide cannot generate an impression while another banner is being viewed.
Events rejected before consent are not replayed. A currently visible hero can
be measured after a new choice; revocation stops subsequent enqueues immediately.

Only statistics-consented clicks gain fixed UTM values for website/pizza_club
and an allowlisted placement. Without statistics consent, links stay clean.
The runtime exists only on the homepage; shared navigation elsewhere still works
without this optional measurement. There are no Google/Meta/GTM tags on Club.

**A CTA click is never a signup conversion.** New membership counts belong to
Orderfly's durable membership events. Per-placement membership attribution is
separate pending work in #426, requiring the existing firstparty consent contract;
UTM links do not prove it exists. No conversion event is emitted by this popup.
Google command enqueue tests are distinct from actual Google receipt. The latter
must be checked in a consented live visit/Google reporting before claiming receipt.

## Campaign copy and release

Copy reflects the active one-stamp welcome campaign from #487: new members once,
free membership from15, newsletter consent and terms required, eight stamps for
a pizza, eligible purchases from100kr, no discounted/thirdparty-order stamps.
No percentage discount or profile bonus is advertised. Before production publish,
read the public program again; if the campaign changes, update/remove the static
one-stamp marketing copy together with the admin change.

Stage on the Webflow subdomain first; test desktop/mobile, every new link, popup
closing and cookie interplay. Production publish is serial and must not include
unrelated drafts without inspection. Preserve existing page/site freeform code.
Native elements added by this task are tracked in the issue checkpoint for rollback;
restore only this task's blocks/fields and do not overwrite later editor changes.
Webflow publish is separate from merging this source/evidence archive into Orderfly.
No Next.js runtime, Firebase data, payment, member or stamp write is part of #499.
Actual signup/one-stamp issuance remains the controlled live acceptance in #487.

## Validation

`node --check design/esmeralda-club-popup.js`

`CLUB_QA_CHROMIUM=/path/to/chromium node --test tests/unit/club-homepage-browser.cjs`

The fourteen real Chromium fixtures cover first-slide placement, preservation of
the three existing CMS slides, offscreen impression suppression and return-slide
measurement, as well as denied/unresolved/allowed statistics,
consent revocation, fixed event fields and destinations, clean/UTM links, cookie
panel precedence, Escape/focus/session dismissal, non-homepage isolation and
preview-host exclusion and 320/390/768/1440 layouts. External requests are intercepted; this is isolated
browser coverage, not provider receipt or production signup acceptance.

Independent source review found one hidden-tab measurement bug: the impression
was marked sent even when the enqueue was rejected. Marking now occurs only after
actual enqueue. The fix and current source were independently rechecked.

Live staging inspection found that `padding-global` also applies flex, centered italic text and a brown background through an existing combo. The Club wrappers therefore reuse `padding-section-medium` with local horizontal spacing, avoiding those unrelated styles. Actual staging computed styles must be checked after publish.

## H6: first slide in the existing hero rotation (2026-10-23)

The existing Club element is moved, not copied, into the existing Swiper wrapper
before its deferred initializer. The three CMS banner items and their queries
remain unchanged. The native presentation wrapper is placed after the hero
component so its three-step explanation remains below the rotation, with a
readable fallback if JavaScript does not run. Existing navigation, popup, signup
links and consent rules are unchanged. If Swiper already exists, update it and
select slide zero. The page's two hero image preloads now reference the existing
Club WebP instead of the brunch image. Preserve all other freeform code.

Staging release: Webflow publish task `a91ec8ce-daa7-4517-bcd6-52552c407090`.
Source merge does not publish Webflow production. Validate actual rotation,
pagination, arrows and wraparound in the browser before production acceptance.
The separate H5 Google receipt blocker is not resolved by this layout change.
