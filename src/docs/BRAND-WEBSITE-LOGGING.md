
# Brand Website Module - Logging & Audit

- **Audit Logs (`auditLogs`):** Immutable records of all CMS write operations (`saveBrandWebsite*`). Captures who changed what, when, and from where.
- **API Logs (`dadmin/developer/logs`):** Detailed debug and error logs from API routes and server actions for developer troubleshooting.

**Rules:**
*   A global toggle and per-action toggles control logging verbosity.
*   All `saveBrandWebsite*` actions must create an audit entry.
