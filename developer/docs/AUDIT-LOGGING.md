# Audit logging

Orderfly records key actions in the audit log.

Examples:

- Order created
- Order status changed
- Superadmin changes to brands and locations

Audit logs are visible in the superadmin under `/superadmin/logs`.

The former `/api/superadmin/docs/audit-settings` export is retired (410 after authorization). Audit infrastructure is retained; consult `docs/security-rbac.md` and the current server action implementations for authorization and audit behavior.
