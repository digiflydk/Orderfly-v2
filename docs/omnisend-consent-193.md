# Esmeralda newsletter consent (#193)

`recordNewsletterConsent` stores one brand-scoped event and contact outbox job
per checkout submission. The existing authenticated notification heartbeat now
also runs the contact sync worker, so a separate marketing scheduler is not
required for contact jobs. Missing configuration leaves the job `pending` with
zero provider attempts, an hourly recheck and a specific administrative error.
After configuration, Superadmin can bring a waiting job forward with the
brand-scoped retry action. Neither path sends or schedules a campaign.

The active App Hosting revision must expose `ORDERFLY_OMNISEND_BRANDS` as a
server-only secret. Esmeralda's Orderfly brand ID is
`oeypKaMyYcQjIwaa1PtV`; the expected Omnisend brand ID from the existing
integration notes is `69618ede8284682be9bb5290`. The secret needs a valid
restricted contacts API key, `enabled: true`, and
`consentMode: "single_opt_in"`. The worker checks `/brands/current` before
any contact write. Confirm the connected brand and opt-in policy with the
operator; never paste a key into the repository or a browser form. The secret
binding exists in `apphosting.yaml`, but its presence and validity in the
running revision must be verified separately. The existing authenticated
notification heartbeat must also be running.

An active newsletter signup discount is offered and accepted only if its
brand integration is configured. The consent checkbox remains voluntary when
configuration is missing, explicitly tells the customer that sync is pending,
and keeps the submitted consent for later processing. Consent text now has
version `checkout-email-da-2026-09-28`; the previous Danish version remains
accepted for older clients and retains its original text in audit records.
The provider contact endpoint updates by email, and a retry first reads the
contact. Already subscribed means confirmed sync, with no second POST.
The shared provider reports an already subscribed contact distinctly: checkout
records the contact as confirmed, while Games records its established
`accepted` (no provider change) outcome.
Opt-outs remain protected by the event timestamp. The paid-order event release
switch is separate and remains disabled.

`node --test tests/unit/omnisend-193.cjs tests/unit/order-flow-71.cjs
tests/unit/newsletter-discount.cjs tests/unit/checkout-browser.cjs` and
`npm run typecheck` cover mapping states, zero-attempt wait, brand scope,
duplicate submissions, contact retry, eligible and ineligible discounts,
checkout consent and the worker heartbeat. No production data migration is
needed. After an approved deployment and verified secret, use a controlled
test address to inspect contact and job state, including the pending consent
associated with QA reference `22de27955a86`. Check the older pending event's
recorded consent and provider state before replay. Do not blindly replay an
uncertain provider result or send a newsletter campaign.
