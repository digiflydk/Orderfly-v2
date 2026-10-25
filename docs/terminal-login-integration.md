# Location terminal login integration (#635)

The dedicated `/terminal/login` and `/terminal/orders` routes bypass storefront rewrites on brand subdomains, as merchant/admin routes already do. `terminal` is reserved as a new brand slug. Existing locations named terminal retain their explicit brand/location URL. Authentication remains bound to the current host and the configured native location, never inferred from a storefront slug. No admin-session lifetime changes.

Release requires independent current-head review, own boundary/browser tests and build, current main, green existing CI, deployed SHA verification and live acceptance. Do not configure production credentials or create test orders/prints as part of unattended QA.
