# Manual customer sync

The Customers page exposes separate Omnisend and table-booking sync actions. Both require a platform superuser and one selected brand. The browser sends only the selected brand ID and source to Orderfly's same-origin route.

## Omnisend

`POST /api/superadmin/customers/sync` checks `ORDERFLY_OMNISEND_BRANDS` for the selected enabled brand, then invokes only `runOmnisendContactImportWorker`. It bypasses the scheduled `nextAttemptAt` window but still honors the Firestore lease, so a manual click cannot overlap an active importer. One click imports a maximum of 25 contacts. The UI indicates whether another backfill page remains. This endpoint never processes the consent outbox, creates campaigns or sends messages.

## Table bookings

Orderfly calls the private Edge Function named `orderfly-customer-sync-trigger` with the selected brand ID and the existing `x-esmeralda-integration-secret`. The function:

1. Resolves the Orderfly brand through an active `orderfly_organization_mappings` row and confirms there is an active location mapping.
2. Calls the service-role-only `orderfly_backfill_booking_customer_sync` RPC. The migration selects only bookings covered by active brand/location mappings that have no customer link and have a valid email or a phone with digits. The booking ID uniqueness constraint prevents duplicate queue jobs. A `skipped` job is reset only when its recorded reason is one of the known missing-identity errors (the old email-only error or the current email-or-phone error); failed identity conflicts are left unchanged.
3. Processes at most five due customer-sync jobs immediately. Any remaining work stays in the existing queue for the scheduled worker. The API returns counts only, never customer details.

The booking resolver accepts either email or phone. Email remains optional for booking-only customers and is returned as `normalized_email: null` until the profile gains an email. Phone-only bookings do not grant newsletter consent. When an online order or Omnisend contact later matches that phone, the existing brand-scoped customer is updated instead of creating a second profile. A phone-only profile can be edited without inventing an email. If Omnisend later adds the profile's first email, its consent is applied only when the provider record contains explicit consent evidence.

## Coordinated deployment

These files span Orderfly and the Supabase booking runtime. Deploy in this order after independent review and PO acceptance:

1. Apply `supabase/migrations/20261014004726_orderfly_customer_manual_sync.sql` to the Esmeralda Supabase project. It updates the existing backfill RPC and restricts its execution to `service_role`.
2. Deploy the updated `supabase/functions/_shared/orderfly-customer-identity.ts` and `orderfly-customer-sync.ts` alongside the existing `notification-worker`. The existing scheduled worker must use the phone-aware helper so a later cron run does not mark phone-only jobs as skipped.
3. Deploy `supabase/functions/orderfly-customer-sync-trigger/index.ts` with `verify_jwt=false`; the function has its own high-entropy shared-secret check. Keep the existing `ORDERFLY_ESMERALDA_INTEGRATION_SECRET` configured in Supabase and Orderfly. Do not add a service-role key to Orderfly or the browser.
4. Deploy the reviewed Orderfly revision. `apphosting.yaml` provides the nonsecret function URL as `ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT`; the server reads the shared secret from Secret Manager.
5. When you're ready to validate a production import, explicitly run a controlled booking sync for one mapped brand, confirm the returned aggregate counts and customer source, and confirm the queue settles. The deployment itself does not start a sync. Do not use a real newsletter send as a sync check.

The source repository for this Orderfly PR contains the migration and Edge Function sources so the coordinated change is reviewable. A deployment only makes the manual controls available; it does not import customer data automatically. Run a source sync from the Customers page only when you're ready to import that brand's data.

## Local checks

```sh
npm run typecheck
node --test tests/unit/customer-manual-sync.cjs tests/unit/customer-sync-actions-browser.cjs tests/unit/orderfly-booking-sync.cjs tests/unit/omnisend-contact-import.cjs
npx playwright test tests/esmeralda-customer-integration.spec.ts tests/customer-directory.spec.ts
```
