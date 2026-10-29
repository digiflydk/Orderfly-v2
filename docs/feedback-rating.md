# Feedback inbox rating (#769)

The inbox displays each saved rating as a Danish number (up to two decimal places) out of five alongside proportionally filled stars. A rating of 3.2 therefore appears as `3,2 / 5`, with three full stars and one 20% filled star. Stars use the unrounded saved value. The accessible name announces the score once; decorative stars and duplicate numeric text are hidden from screen readers.

Missing, zero, non-finite or out-of-range values display `Ingen bedømmelse`, not five empty stars. Rating calculations, stored data, filters, moderation and permissions are unchanged.

`tests/unit/feedback-rating-browser.cjs` renders the production component in Chromium at mobile/desktop widths and checks visible score, accessible name, actual fill widths, whole ratings, missing/invalid values and overflow. Existing inbox browser tests remain applicable. Use `CART_CHROMIUM_PATH` for an installed browser if required.

Release requires current-code CI, independent review, coordinator merge/deploy and read-only live verification. No production records are created by these tests.
