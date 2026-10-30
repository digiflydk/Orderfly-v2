# Esmeralda V2 visual acceptance (#780)

The functional release in PR #783 does not establish visual acceptance. This
follow-up uses the approved mobile mockups as layout references, while keeping
the existing catalog, prices, availability and checkout integration authoritative.

## Reference and precedence

References reviewed on 2026-10-30: “Esmeralda: Fra menu til betaling”, “Esmeralda
mobilweb: pasta, burger og sandwich”, and “Esmeralda à la carte mobilbestilling”.
Their prices, dish photography and offers are illustrative. The user's subsequent
corrections override the earlier full-flow image: controls are rectangular and
checkout has only **Gå til betaling**, handing off to the existing payment provider.
The inconsistent doneness shown in the à la carte image must never be reproduced.

## Visual acceptance

| Surface | Required presentation |
| --- | --- |
| Menu | Compact branded header, fulfilment/time summary, search, sticky category navigation, image-led product rows and clear rectangular add controls. No oversized marketing hero before the food. |
| Product | Prominent full-width food image, title/description/price hierarchy, outlined customization action, compact allergens, rectangular quantity controls. Required choices stay visible and enforce the existing validation. |
| Cart | Clear heading and fulfilment summary, real product images, readable selections and edit actions, rectangular quantities, separated total and inset bottom checkout action. |
| Checkout | Compact fulfilment/time summary, clear labeled fields and order totals, fixed bottom payment handoff action. No card or wallet selection in the storefront. |
| All | Charcoal surfaces, white/gray text, restrained warm gold, self-hosted Inter, visible focus states, safe-area clearance and content reachable above fixed actions. |

Menu upgrades appear only for configured, available offers. Missing production
menu configuration remains a separate issue and does not block presentation fixes.
V1 and other merchants retain their existing presentation and business rules.

## Evidence and release

Review screenshots at 390px mobile width for each surface, including scrolled
product and checkout states. Also test 320px and desktop for overflow, readable
controls and action reachability. Synthetic fixture screenshots prove component
layout, not real catalog completeness or deployment.

Run typecheck and the relevant menu, product, cart, checkout and tenant-isolation
regressions. Required-choice rejection, restoration of edits, price calculation
and payment handoff must remain covered. Independently review the current PR head.
Follow AGENTS.md merge gates, verify the deployed release and then inspect the
actual V2 journey. Do not create production orders or submit payment during
unattended verification. Keep the issue open if any visual or functional criterion
remains unverified.
