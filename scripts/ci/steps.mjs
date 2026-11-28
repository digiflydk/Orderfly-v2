// Every test step the GitHub Actions test workflows ran before #934, in the same order.
// Actions now only deploys; Work runs these locally with `npm run ci` before merging.
export const STEPS = [
 {
  "name": "Typecheck",
  "source": "ui-tests",
  "run": "npm run typecheck",
  "needs": []
 },
 {
  "name": "Public website booking recovery regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/website-booking-flow.cjs tests/unit/website-booking-routes.cjs tests/unit/esmeralda-public-host.cjs tests/unit/website-booking-browser.cjs",
  "needs": []
 },
 {
  "name": "Esmeralda V2 image generation, routing and exact-source checks",
  "source": "ui-tests",
  "run": "node --test tests/unit/esmeralda-menu-thumbnails.cjs tests/unit/lighthouse-image-url.cjs tests/unit/esmeralda-menu-images.cjs tests/unit/brand-subdomains-12.cjs tests/unit/product-link.cjs tests/unit/storefront-home-screen.cjs tests/unit/storefront-home-screen-browser.cjs",
  "needs": []
 },
 {
  "name": "Esmeralda V2 menu, products, combos and checkout browser checks",
  "source": "ui-tests",
  "run": "node --test tests/unit/menu-refresh-browser.cjs tests/unit/storefront-route-hydration-browser.cjs tests/unit/delivery-sheet-loading-browser.cjs tests/unit/tilvalg-storefront-browser.cjs tests/unit/combo-modifiers-browser.cjs tests/unit/checkout-browser.cjs",
  "needs": []
 },
 {
  "name": "Cart price and mobile cart bar delivery regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/delivery-cart-price.cjs tests/unit/mobile-cart-bar-price.cjs",
  "needs": []
 },
 {
  "name": "Receipt settings, online preview and editor regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/receipt-*.cjs",
  "needs": []
 },
 {
  "name": "Brand automatic print and unsent expiry regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-automatic-print*.cjs tests/unit/printing-unsent-expiry.cjs",
  "needs": []
 },
 {
  "name": "Superadmin print log regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-print-log*.cjs",
  "needs": []
 },
 {
  "name": "Platform administration and brand-reference regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/release-version.cjs tests/unit/mpanel-platform-admin.cjs tests/unit/brand-location-edit.cjs tests/unit/platform-role-server.cjs tests/unit/freemium-access.cjs tests/unit/access-authority.cjs tests/unit/order-access.cjs tests/unit/admin-session.cjs tests/unit/opsfly-login.cjs tests/unit/mpanel-launch.cjs tests/unit/website-access.cjs tests/unit/access-permission-migration.cjs tests/unit/loyalty-stamp-card-rules.cjs tests/unit/loyalty-stamp-card-counter.cjs tests/unit/loyalty-merchant-routes.cjs tests/unit/loyalty-membership.cjs tests/unit/loyalty-portal-routes.cjs tests/unit/loyalty-admin.cjs tests/unit/loyalty-portal-pages.cjs tests/unit/loyalty-order-history.cjs tests/unit/loyalty-stamp-card-texts.cjs",
  "needs": []
 },
 {
  "name": "Native Club QR attribution regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/loyalty-qr-attribution.cjs",
  "needs": []
 },
 {
  "name": "Local QA environment safety regressions",
  "source": "ui-tests",
  "run": "node --test tests/unit/local-qa-environment.cjs tests/unit/local-qa-client.cjs tests/unit/local-qa-browser.cjs tests/unit/local-qa-credential-metadata.cjs",
  "needs": []
 },
 {
  "name": "Isolated intent proof contract regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/local-qa-intent-proof.cjs",
  "needs": []
 },
 {
  "name": "Explicit local intent runtime safety regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/local-qa-intent-runtime.cjs",
  "needs": []
 },
 {
  "name": "Pilot native transaction runner safety regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/pilot-native-runner-safety.cjs",
  "needs": []
 },
 {
  "name": "Booking feedback and mail regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/booking-feedback-setup-144.cjs tests/unit/booking-feedback-timing.cjs tests/unit/feedback-mail.cjs tests/unit/feedback-readiness.cjs tests/unit/feedback-central-access.cjs tests/unit/feedback-scopes.cjs tests/unit/feedback-admin-notifications.cjs tests/unit/feedback-report-public.cjs tests/unit/feedback-page-access.cjs tests/unit/feedback-presentation.cjs tests/unit/feedback-dine-in.cjs tests/unit/feedback-dully.cjs tests/unit/dully-feedback-browser.cjs tests/unit/customer-dully.cjs tests/unit/customer-retention.cjs tests/unit/feedback-replies.cjs",
  "needs": []
 },
 {
  "name": "Omnisend contact import and consent regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/omnisend-contact-import.cjs tests/unit/omnisend-193.cjs tests/unit/customer-manual-sync.cjs tests/unit/orderfly-booking-sync.cjs",
  "needs": []
 },
 {
  "name": "Stripe payment lifecycle regression (#189)",
  "source": "ui-tests",
  "run": "node --test tests/unit/stripe-lifecycle-189.cjs tests/unit/cart-cancel.cjs tests/unit/payment-display.cjs tests/unit/takeaway-qa-regressions.cjs tests/unit/wait-for-release.cjs tests/unit/printing-domain.cjs tests/unit/printing-configuration.cjs tests/unit/printing-activity-metadata.cjs tests/unit/printing-reads.cjs tests/unit/printing-identity.cjs tests/unit/printing-writes.cjs tests/unit/printing-lifecycle.cjs tests/unit/printing-outbox.cjs tests/unit/printing-queue-summary.cjs tests/unit/printing-queue-review.cjs tests/unit/printing-resume.cjs",
  "needs": []
 },
 {
  "name": "Private printer device credential regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-auth.cjs",
  "needs": []
 },
 {
  "name": "Native printer device verification regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-auth-native.cjs",
  "needs": []
 },
 {
  "name": "Native protocol observation regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-protocol-observation-native.cjs",
  "needs": []
 },
 {
  "name": "Native print claim reservation regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-native-claim.cjs",
  "needs": []
 },
 {
  "name": "Native print confirmation persistence regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-print-result-native.cjs",
  "needs": []
 },
 {
  "name": "Native printer credential provisioning regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-credentials-service.cjs",
  "needs": []
 },
 {
  "name": "Supervised pilot qualification regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-pilot-qualification.cjs",
  "needs": []
 },
 {
  "name": "Supervised pilot HTTP control regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-direct-test.cjs tests/unit/printing-pilot-control-http.cjs tests/unit/printing-pilot-qualification-consumption.cjs tests/unit/printing-synthetic-pilot-job.cjs tests/unit/printing-synthetic-pilot-http.cjs",
  "needs": []
 },
 {
  "name": "CloudPRNT Basic native identity regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-cloudprnt-http-auth.cjs",
  "needs": []
 },
 {
  "name": "CloudPRNT no-job poll HTTP regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-cloudprnt-poll-http.cjs",
  "needs": []
 },
 {
  "name": "CloudPRNT scoped no-job route regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-cloudprnt-poll-route.cjs",
  "needs": []
 },
 {
  "name": "Superadmin printer credential HTTP regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-credentials-http.cjs",
  "needs": []
 },
 {
  "name": "Safe printer credential metadata regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-credentials-metadata.cjs",
  "needs": []
 },
 {
  "name": "CloudPRNT protocol and simulator regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-cloudprnt.cjs",
  "needs": []
 },
 {
  "name": "Kitchen receipt preview regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-receipts.cjs",
  "needs": []
 },
 {
  "name": "Kitchen PNG payload regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-kitchen-png.cjs",
  "needs": []
 },
 {
  "name": "Immutable synthetic testbon content regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-job-content.cjs",
  "needs": []
 },
 {
  "name": "Combined print-intent batch regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-outbox-batch.cjs",
  "needs": []
 },
 {
  "name": "Stripe print-transition origin proof regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-stripe-transition-proof.cjs",
  "needs": []
 },
 {
  "name": "Printer routing preview regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-routing.cjs",
  "needs": []
 },
 {
  "name": "Native print catalog projection regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-catalog-projection.cjs",
  "needs": []
 },
 {
  "name": "Saved printer routing API regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-saved-routing.cjs",
  "needs": []
 },
 {
  "name": "Scoped print-intent target policy regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-intent-target-policy.cjs",
  "needs": []
 },
 {
  "name": "Staff pickup print-origin proof regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-pickup-transition-proof.cjs",
  "needs": []
 },
 {
  "name": "Unpaid pickup acceptance origin regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-unpaid-acceptance-origin.cjs",
  "needs": []
 },
 {
  "name": "Atomic unpaid pickup originals regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-unpaid-originals.cjs",
  "needs": []
 },
 {
  "name": "Native and compatibility transaction bridge regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/firestore-compat-transaction.cjs",
  "needs": []
 },
 {
  "name": "Atomic Stripe routed print-intent integration",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-stripe-settlement-integration.cjs",
  "needs": []
 },
 {
  "name": "Atomic staff pickup settlement regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-pickup-settlement-integration.cjs",
  "needs": []
 },
 {
  "name": "Private settlement preparation regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/settlement-preparation.cjs",
  "needs": []
 },
 {
  "name": "Checkout, customer and order mail regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/checkout-reliability.cjs tests/unit/checkout-recovery-regressions.cjs tests/unit/checkout-attempt.cjs tests/unit/checkout-route.cjs tests/unit/checkout-critical-path.cjs tests/unit/checkout-price-validation.cjs tests/unit/checkout-session-persistence.cjs tests/unit/consent-delivery.cjs tests/unit/promotion-review.cjs tests/unit/cart-restore.cjs tests/unit/commerce-p1.cjs tests/unit/commerce-p2.cjs tests/unit/merchant-payment-methods.cjs tests/unit/payment-confirmation-job.cjs tests/unit/omnisend-paid-order.cjs tests/unit/storefront-performance.cjs",
  "needs": []
 },
 {
  "name": "Promotion and reservation regression (#206,",
  "source": "ui-tests",
  "run": "node --test tests/unit/stale-discount-holds-210.cjs tests/unit/promotion-qa-206-219.cjs tests/unit/qa-218-187.cjs tests/unit/brand-subdomains-12.cjs",
  "needs": []
 },
 {
  "name": "Printer credential controls and one-time delivery regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-device-credentials-ui.cjs tests/unit/printing-connection-setup.cjs tests/unit/printing-connection-setup-http.cjs tests/unit/printing-connection-status.cjs",
  "needs": []
 },
 {
  "name": "Supervised pilot operator controls browser regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-pilot-controls-browser.cjs",
  "needs": []
 },
 {
  "name": "Supervised purchase printing regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-manual-*.cjs tests/unit/printing-pilot-status.cjs tests/unit/printing-order-test-policy.cjs tests/unit/printing-order-test-control-http.cjs tests/unit/printing-ordinary-native.cjs tests/unit/printing-order-test-controls-browser.cjs",
  "needs": []
 },
 {
  "name": "Dedicated printer action page regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-action-*.cjs",
  "needs": []
 },
 {
  "name": "Explicit printer activation browser regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-printer-activation-browser.cjs",
  "needs": []
 },
 {
  "name": "Printer routing editor and sample preview regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-routing-editor.cjs tests/unit/printing-routing-ui-browser.cjs",
  "needs": []
 },
 {
  "name": "Core browser regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/printing-ui-browser.cjs tests/unit/merchant-payment-browser.cjs tests/unit/brand-location-browser.cjs tests/unit/opsfly-login-browser.cjs tests/unit/mpanel-launch-browser.cjs tests/unit/feedback-browser.cjs tests/unit/customer-form-browser.cjs tests/unit/customer-sync-actions-browser.cjs tests/unit/loyalty-admin-browser.cjs tests/unit/loyalty-portal-browser.cjs tests/unit/loyalty-counter-browser.cjs",
  "needs": []
 },
 {
  "name": "Real isolated browser login and native persistence proof",
  "source": "ui-tests",
  "run": "node scripts/local-qa/run-browser.cjs",
  "needs": [
   "qa-tools"
  ]
 },
 {
  "name": "Real isolated credential metadata and native persistence proof",
  "source": "ui-tests",
  "run": "QA0_CREDENTIAL_METADATA_PROOF=true node scripts/local-qa/run-backend.cjs",
  "needs": [
   "qa-tools"
  ]
 },
 {
  "name": "Actual isolated pilot native transaction and one-shot delivery proof",
  "source": "ui-tests",
  "run": "node tests/local-qa/pilot-native-transaction.cjs --run",
  "needs": [
   "qa-tools"
  ]
 },
 {
  "name": "Native intent fixture and launcher safety regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/local-qa-native-intent.cjs tests/unit/local-qa-native-intent-launcher.cjs",
  "needs": []
 },
 {
  "name": "Real isolated atomic settlement and replay proof",
  "source": "ui-tests",
  "run": "node scripts/local-qa/run-native-intents.cjs",
  "needs": [
   "qa-tools"
  ]
 },
 {
  "name": "QR module behavior, scope and browser regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/qr-*.cjs",
  "needs": []
 },
 {
  "name": "Games editor browser regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/games-editor-browser.cjs",
  "needs": []
 },
 {
  "name": "Shared admin access and filter regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/marketing-layout-boundary.cjs tests/unit/endpoint-audit.cjs tests/unit/settings-access.cjs tests/unit/system-cleanup.cjs tests/unit/access-navigation.cjs tests/unit/printing-ui-page.cjs tests/unit/merchant-admin-portal.cjs tests/unit/admin-sales-filters.cjs tests/unit/admin-loading.cjs tests/unit/admin-mobile-header.cjs",
  "needs": []
 },
 {
  "name": "Shared admin visual regression",
  "source": "ui-tests",
  "run": "node --test tests/unit/admin-overview-browser.cjs tests/unit/system-settings-browser.cjs",
  "needs": []
 },
 {
  "name": "Club campaign service and browser regressions",
  "source": "ui-tests",
  "run": "node --test --test-concurrency=1 tests/unit/loyalty-signup-notifications.cjs tests/unit/loyalty-signup-notifications-browser.cjs tests/unit/loyalty-campaign-bonus.cjs tests/unit/loyalty-campaign-admin.cjs tests/unit/loyalty-club-signup-integration.cjs tests/unit/loyalty-profile.cjs tests/unit/club-promotion-rules.cjs tests/unit/club-checkout.cjs tests/unit/checkout-availability.cjs tests/unit/loyalty-benefits-browser.cjs tests/unit/loyalty-campaign-admin-browser.cjs tests/unit/loyalty-club-admin-summary.cjs tests/unit/loyalty-club-overview-row.cjs tests/unit/loyalty-club-admin-browser.cjs tests/unit/loyalty-profile-browser.cjs",
  "needs": []
 },
 {
  "name": "Esmeralda homepage Club promotion browser regressions",
  "source": "ui-tests",
  "run": "node --test tests/unit/club-homepage-browser.cjs",
  "needs": []
 },
 {
  "name": "Esmeralda website payload, policy and consent regressions",
  "source": "ui-tests",
  "run": "node --test tests/unit/esmeralda-public-host.cjs tests/unit/web-design-preview.cjs tests/unit/website-tracking-policy.cjs tests/unit/website-consent.cjs tests/unit/website-consent-payload.cjs tests/unit/website-contact-payload.cjs tests/unit/website-critical-bootstrap.cjs tests/unit/website-footer-booking-label.cjs tests/unit/website-home-delivery.cjs tests/unit/website-menu-filter.cjs tests/unit/website-performance-payload.cjs tests/unit/website-response-encoding.cjs tests/unit/website-review-rotation.cjs tests/unit/website-landing-repairs.cjs tests/unit/website-seo-meta.cjs tests/unit/website-content-fixes.cjs\npython3 -m unittest discover -s tests/unit -p 'test_preview_*.py'\nnode scripts/test-mpanel-host.cjs",
  "needs": []
 },
 {
  "name": "Esmeralda website browser regressions",
  "source": "ui-tests",
  "run": "node --test --test-concurrency=1 tests/unit/website-consent-browser.cjs tests/unit/website-footer-booking-label-browser.cjs tests/unit/website-home-delivery-browser.cjs tests/unit/website-menu-filter-browser.cjs tests/unit/website-performance-browser.cjs tests/unit/website-review-browser.cjs tests/unit/website-landing-repairs-browser.cjs",
  "needs": []
 },
 {
  "name": "Orderfly marketing landing browser regressions",
  "source": "ui-tests",
  "run": "node --test tests/unit/orderfly-landing-browser.cjs tests/unit/root-order-entry.cjs",
  "needs": []
 },
 {
  "name": "Personal discount card service and browser regressions",
  "source": "ui-tests",
  "run": "node --test --test-concurrency=1 tests/unit/discount-card-*.cjs",
  "needs": []
 },
 {
  "name": "Build",
  "source": "ui-tests",
  "run": "npm run build",
  "needs": []
 },
 {
  "name": "Esmeralda website HTTP regressions",
  "source": "ui-tests",
  "run": "node --test --test-concurrency=1 tests/unit/esmeralda-public-host-http.cjs tests/unit/web-design-preview-http.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/funnel-tracking.cjs tests/unit/invoic",
  "source": "funnel-regression",
  "run": "node --test tests/unit/funnel-tracking.cjs tests/unit/invoice-attribution.cjs tests/unit/tracking-consent.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/vendor-tracking-browser.cjs",
  "source": "funnel-regression",
  "run": "node --test tests/unit/vendor-tracking-browser.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/admin-loading.cjs tests/unit/analytic",
  "source": "funnel-regression",
  "run": "node --test tests/unit/admin-loading.cjs tests/unit/analytics-loading-browser.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/cookie-consent-management.cjs tests/u",
  "source": "funnel-regression",
  "run": "node --test tests/unit/cookie-consent-management.cjs tests/unit/cookie-consent-browser.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/commerce-p2-browser.cjs tests/unit/ch",
  "source": "funnel-regression",
  "run": "node --test tests/unit/commerce-p2-browser.cjs tests/unit/checkout-browser.cjs tests/unit/brand-tracking-browser.cjs",
  "needs": []
 },
 {
  "name": "node --test tests/unit/platform-firestore-preparation.mjs te",
  "source": "platform-firestore-rules",
  "run": "node --test tests/unit/platform-firestore-preparation.mjs tests/unit/firestore-operations.mjs tests/unit/delete-e2e-test-orders.mjs",
  "needs": []
 },
 {
  "name": "npm ci --prefix tests/firestore",
  "source": "platform-firestore-rules",
  "run": "npm ci --prefix tests/firestore",
  "needs": []
 },
 {
  "name": "npm test --prefix tests/firestore",
  "source": "platform-firestore-rules",
  "run": "npm test --prefix tests/firestore",
  "needs": []
 },
 {
  "name": "Verify read-only probe safeguards",
  "source": "qr-acceptance",
  "run": "node --test tests/unit/qr-retention-readiness.cjs",
  "needs": []
 },
 {
  "name": "Actual native QR login, scans, analytics, history and browser download, twice",
  "source": "qr-acceptance",
  "run": "node tests/local-qa/qr-run.cjs",
  "needs": [
   "qa-tools"
  ]
 }
];
