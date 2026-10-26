# Native free-delivery campaign quotes

Trusted quote creation may pass an eligible `appliedCampaign` snapshot to `buildQuote`: kind `native_free_delivery`, sorted unique native campaign IDs, and the maximum eligible distance in meters. The native controller must calculate eligibility from the current cart and campaign definitions, set the distance cap to the lesser of delivery settings coverage and base pricing coverage, and revalidate eligibility at checkout. This is not a browser-controlled free-delivery flag.

The factory keeps `price.rules` as the base merchant rules and derives only the effective `freeDelivery` rule (zero minimum subtotal and the campaign distance cap). The immutable, content-digested quote stores `economics.baseRules` and `economics.appliedCampaign` together; `economics.rules` contains the derived effective rules. Quotes without campaigns retain their previous shape. Stored validation rejects unpaired provenance, duplicate or unsorted campaign IDs, increased coverage, changes to other pricing rules, and routes outside campaign coverage.

Current settings checks at persistence and dispatch compare `economics.baseRules ?? economics.rules` with native pricing settings. Pricing calculation and acceptance use effective `economics.rules`. The supplier cost, customer fee ceiling, and maximum subsidy are not altered. A free-delivery campaign which exceeds the permitted subsidy cannot produce a usable quote; it never silently charges a delivery fee instead.

Internal regression coverage is in `tests/unit/delivery-quote-binding.cjs`. No GitHub Actions or live provider calls are needed for this validation.
