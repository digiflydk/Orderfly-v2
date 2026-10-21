# QR module permissions and navigation (#406, coordination #389)

Candidate only. This change adds the permission catalogue and sidebar entry. It does not deploy the module, authorize its API, create roles, or change any saved role or membership.

| Permission | Intended server action |
|---|---|
| `orderfly.qr_codes:view` | List and inspect permitted codes |
| `orderfly.qr_codes:create` | Create or duplicate a code |
| `orderfly.qr_codes:edit` | Change destination, style, metadata, pause or resume |
| `orderfly.qr_codes:archive` | Archive a code without reusing its public identifier |
| `orderfly.qr_codes:export` | Download image or export permitted data |
| `orderfly.qr_codes:analytics` | Read permitted scan statistics |

These are independent grants. Viewing codes does not grant mutations or analytics. Generic analytics and catalogue permissions do not grant QR access. Existing company and location policy boundaries apply unchanged; a company-admin role name or kind does not add grants.

The existing Promotions sidebar group contains **QR-koder**, pointing to `/superadmin/qr-codes`. This route and nested paths require `view` for navigation. A permission such as `export` alone does not make the administration module visible. The existing mPanel Orderfly launcher remains the entry point. Its QR-only landing-page support and the mPanel permission labels are integration work in #395, not implemented here.

Navigation is a display policy only. Every server read, mutation and export must use a verified native session, revalidate its corresponding action and explicitly restrict the stored brand and location. Issue #395 owns those handlers. A location-scoped grant cannot read brand-wide records, foreign locations or another brand.

Validation: `node --test tests/unit/qr-access.cjs tests/unit/access-navigation.cjs tests/unit/access-authority.cjs tests/unit/access-permission-migration.cjs`; `npm run typecheck`. Browser sidebar verification is isolated component QA, not a signed-in production acceptance test. Release requires current-head CI, independent review, deployment evidence and the live checks specified by #389.
