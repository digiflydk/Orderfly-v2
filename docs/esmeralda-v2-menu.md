# Esmeralda V2 menu and products (#780)

The V2 presentation is enabled by the server-selected storefront V2 context, only for the Esmeralda V2 alias. The menu continues to use the existing brand/location catalog, availability, discount and combo resolution. No sample dishes, example prices or new offers are introduced.

V2 product cards have a labelled rectangular Tilføj button. It opens the product detail even when there are no modifiers, allowing a customer to review the dish and quantity before adding it. V1 retains its existing quick-add behavior. Combo cards show Vælg menu and continue to open the existing combo builder only when the chosen fulfilment mode has a valid configured price.

Product and combo portals carry the V2 marker. The dedicated stylesheet loads after the existing commerce theme and scopes all changes to a page containing that marker. It uses the existing self-hosted Inter font, charcoal surfaces, warm gold actions, visible focus outlines and rectangular controls. The menu hero is more compact. Product details have a constrained-height scrolling choice area and a non-scrolling purchase footer; existing commerce panel safe-area padding remains in effect.

Selection rules, conditional visibility, required group validation, maximum quantities, price calculation and editing restoration remain in the existing ProductDialog and ComboBuilderDialog logic. V2 blocks an upgrade when the dish has selected modifiers or required modifier groups because the existing combo model cannot retain per-product modifiers. An explanation directs the customer to add the customized dish itself. Choices remain unchanged. V1 retains its existing upgrade behavior.

Verification is tracked on #780 and its PR: relevant browser tests must cover V2 and V1, required-choice rejection, choice replacement, editing, footer reachability and desktop/mobile layouts before merge. Production catalog/order writes are not part of unattended verification.

## Mockup alignment correction

The V2 menu now starts with a centered brand masthead, working category shortcut and an expandable restaurant-information button. The location photo hero is removed from the default V2 menu so it no longer pushes the food below the fold. Restaurant address, opening hours and reviews remain available under the information button. Fulfilment and live timing remain connected to the existing cart controls. Search precedes the horizontal category rail on mobile; the rail/search area remains sticky while the masthead scrolls away. Active promotions use an eligible catalog product image and the real offer wording, never illustrative mockup foods or prices.

Product list rows retain their images on the left, compact descriptions and visible prices, with rectangular labelled actions. The shared V2 palette is neutral charcoal (#111413/#202323) and warm gold (#e8bf69). V1 retains its original hero, toolbar, layout and quick-add behavior. Visual acceptance requires actual rendered viewport evidence in addition to passing functional tests.
