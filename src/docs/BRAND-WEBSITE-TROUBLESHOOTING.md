
# Brand Website Module - Troubleshooting

1.  **Check Audit Logs:** Look for recent changes under `brands/{brandId}/website/*` in `/superadmin/logs/audit`.
2.  **Check API Logs:** Look for failing `saveBrandWebsite*` calls in `/superadmin/logs/developer`.
3.  **Inspect Snapshots:** Use CMS Snapshots to inspect the current state of Firestore documents.
4.  **Verify DB Paths:** Use the DB Paths Dump to confirm all paths are correct.
5.  **Run Acceptance Tests:** Execute the tests for the failing feature.
6.  **Domain Issues:** Verify `primaryDomain` and `extraDomains` in `brands/{brandId}/website/config` and test `resolveBrandByDomain`.
