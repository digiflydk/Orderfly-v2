import { z } from 'zod';

// Pure policy. Callers must load these records server-side after authenticating
// the session. A decision is never proof of identity or a substitute for a
// company/location predicate on the subsequent business query.
export const FEATURES = [
  ['orderfly.orders', ['view', 'edit']],
  ['orderfly.catalog', ['view', 'create', 'edit', 'delete']],
  ['orderfly.discounts', ['view', 'create', 'edit', 'delete']],
  ['orderfly.customers', ['view', 'create', 'edit', 'delete']],
  ['orderfly.feedback', ['view', 'create', 'edit', 'delete']],
  ['orderfly.loyalty', ['view', 'create', 'edit', 'delete']],
  ['orderfly.analytics', ['view']],
  ['orderfly.website', ['view', 'create', 'edit', 'delete']],
  ['orderfly.billing', ['view', 'edit']],
  ['opsfly.own_documents', ['view', 'edit']],
  ['opsfly.own_time', ['view', 'edit']],
  ['opsfly.own_schedule', ['view', 'edit']],
  ['opsfly.own_training', ['view', 'edit']],
  ['opsfly.own_checklists', ['view', 'edit']],
  ['opsfly.booking', ['view', 'create', 'edit', 'delete']],
  ['opsfly.customers', ['view', 'create', 'edit', 'delete']],
  ['opsfly.employees', ['view', 'create', 'edit', 'delete']],
  ['opsfly.schedule', ['view', 'create', 'edit', 'delete', 'approve']],
  ['opsfly.time', ['view', 'create', 'edit', 'delete', 'approve']],
  ['opsfly.payroll', ['view', 'edit', 'approve']],
  ['opsfly.checklists', ['view', 'create', 'edit', 'delete']],
  ['opsfly.training', ['view', 'create', 'edit', 'approve']],
  ['opsfly.production', ['view', 'create', 'edit', 'delete', 'approve']],
  ['opsfly.inventory', ['view', 'create', 'edit', 'delete', 'approve']],
  ['opsfly.procurement', ['view', 'create', 'edit', 'delete', 'approve']],
  ['platform.members', ['view', 'create', 'edit', 'delete']],
  ['platform.roles', ['view', 'create', 'edit', 'delete']],
  ['platform.companies', ['view', 'create', 'edit']],
  ['platform.locations', ['view', 'create', 'edit']],
  ['platform.notifications', ['view', 'edit']],
] as const;
export const PERMISSIONS = FEATURES.flatMap(([feature, actions]) =>
  actions.map(action => `${feature}:${action}`));
const permissionSet = new Set<string>(PERMISSIONS);
const key = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const keys = z.array(key).max(500).refine(v => new Set(v).size === v.length);
const permission = z.string().refine(v => permissionSet.has(v), 'Unknown permission');
const permissions = z.array(permission).max(500).refine(v => new Set(v).size === v.length);
const scope = z.object({ companyId: key.nullable(), locationIds: keys.nullable() }).strict();
// null locationIds means every location in exactly this company, never every tenant.
export const roleSchema = z.object({
  id: key, name: z.string().trim().min(2).max(160), companyId: key.nullable(),
  kind: z.enum(['superuser', 'company_admin', 'company_user']),
  permissions, active: z.boolean(),
}).strict().superRefine((r, ctx) => {
  if ((r.kind === 'superuser') !== (r.companyId === null))
    ctx.addIssue({ code: 'custom', message: 'Only superuser roles have platform scope' });
});
export const membershipSchema = scope.extend({
  id: key, principalId: key, roleIds: keys, active: z.boolean(),
}).strict().superRefine((m, ctx) => {
  if (m.companyId === null && m.locationIds !== null)
    ctx.addIssue({ code: 'custom', message: 'Platform membership cannot have location scope' });
});
export const policySchema = z.object({
  principals: z.array(z.object({ id: key, active: z.boolean(), name: z.string().trim().min(1).max(160).optional() }).strict()).max(500),
  companies: z.array(z.object({ id: key, active: z.boolean(), name: z.string().trim().min(1).max(160).optional(), locationIds: keys, orderflyBrandIds: keys.default([]), opsflyOrganizationId: z.string().uuid().nullable().default(null) }).strict()).max(500),
  roles: z.array(roleSchema).max(500),
  memberships: z.array(membershipSchema).max(500),
}).strict().superRefine((s, ctx) => {
  for (const rows of [s.principals, s.companies, s.roles, s.memberships])
    if (new Set(rows.map(r => r.id)).size !== rows.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate record ID' });
  const brands=s.companies.flatMap(c=>c.orderflyBrandIds);
  const organizations=s.companies.map(c=>c.opsflyOrganizationId).filter(Boolean);
  if(new Set(brands).size!==brands.length||new Set(organizations).size!==organizations.length)
    ctx.addIssue({code:'custom',message:'Native tenant belongs to more than one company'});
  for (const member of s.memberships) {
    if (!s.principals.some(p => p.id === member.principalId) ||
        (member.companyId !== null && !s.companies.some(c => c.id === member.companyId)))
      ctx.addIssue({ code: 'custom', message: 'Missing membership reference' });
    if (member.roleIds.some(id => !s.roles.some(r => r.id === id && r.companyId === member.companyId)))
      ctx.addIssue({ code: 'custom', message: 'Role outside membership company' });
    if (member.locationIds?.some(id => !s.companies.find(c => c.id === member.companyId)?.locationIds.includes(id)))
      ctx.addIssue({ code: 'custom', message: 'Location outside membership company' });
  }
  for (const role of s.roles)
    if (role.companyId !== null && !s.companies.some(c => c.id === role.companyId))
      ctx.addIssue({ code: 'custom', message: 'Missing role company' });
});
export type Policy = z.infer<typeof policySchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Role = z.infer<typeof roleSchema>;
const requestSchema = scope.extend({ principalId: key, permission }).strict();
export type AccessRequest = z.infer<typeof requestSchema>;
type Decision = { allowed: boolean; reason: string };
const deny = (reason: string): Decision => ({ allowed: false, reason });
const allow = (): Decision => ({ allowed: true, reason: 'granted' });
const activePrincipal = (s: Policy, id: string) => s.principals.some(p => p.id === id && p.active);
const activeRoles = (s: Policy, m: Membership) => s.roles.filter(r => m.roleIds.includes(r.id) && r.active);
export function isSuperuser(s: Policy, id: string): boolean {
  return activePrincipal(s, id) && s.memberships.some(m => m.active &&
    m.principalId === id && m.companyId === null &&
    activeRoles(s, m).some(r => r.kind === 'superuser' && r.companyId === null));
}
function covers(member: Membership, requested: AccessRequest): boolean {
  if (member.companyId !== requested.companyId) return false;
  if (member.locationIds === null) return true;
  return requested.locationIds !== null && requested.locationIds.length > 0 &&
    requested.locationIds.every(id => member.locationIds!.includes(id));
}
function decide(s: Policy, q: AccessRequest, requireAdmin = false): Decision {
  if (!activePrincipal(s, q.principalId)) return deny('principal_inactive');
  if (q.companyId !== null) {
    const company = s.companies.find(c => c.id === q.companyId);
    if (!company?.active) return deny('company_inactive');
    if (q.locationIds !== null && (!q.locationIds.length || q.locationIds.some(id => !company.locationIds.includes(id))))
      return deny('location_outside_company');
  } else if (q.locationIds !== null) return deny('invalid_scope');
  if (isSuperuser(s, q.principalId)) return allow();
  if (q.companyId === null) return deny('platform_access_required');
  const members = s.memberships.filter(m => m.active && m.principalId === q.principalId && covers(m, q));
  // A single membership must cover the entire requested scope; combining disjoint
  // location memberships must not accidentally authorize a company-wide query.
  if (!members.some(m => activeRoles(s, m).some(r =>
    (!requireAdmin || r.kind === 'company_admin') && r.permissions.includes(q.permission))))
    return deny('permission_missing');
  return allow();
}
export function authorize(snapshot: unknown, request: unknown): Decision {
  const s = policySchema.safeParse(snapshot), q = requestSchema.safeParse(request);
  if (!s.success || !q.success) return deny('invalid_policy_or_request');
  // Freemium has no plan, expiry or paid-module condition. Identity, membership
  // status, tenant/location boundaries and explicit permissions still apply.
  return decide(s.data, q.data);
}

// Must execute against the same transaction snapshot as the resulting write.
// Covers BOTH the old and new record, preventing reassignment into an admin's
// company from stealing a record in another company.
export function authorizeMembershipChange(snapshot: unknown, actorId: string,
  before: unknown | null, after: unknown | null): Decision {
  const parsed = policySchema.safeParse(snapshot);
  if (!parsed.success || (!before && !after)) return deny('invalid_policy_or_request');
  const s = parsed.data;
  const old = before === null ? null : membershipSchema.safeParse(before);
  const next = after === null ? null : membershipSchema.safeParse(after);
  if ((old && !old.success) || (next && !next.success)) return deny('invalid_membership');
  const previous = old?.success ? old.data : null, value = next?.success ? next.data : null;
  if (previous && !s.memberships.some(m => JSON.stringify(m) === JSON.stringify(previous))) return deny('stale_membership');
  if (value && (previous ? previous.id !== value.id || previous.principalId !== value.principalId : s.memberships.some(m => m.id === value.id)))
    return deny('immutable_identity');
  const updated = { ...s, memberships: s.memberships.filter(m => m.id !== previous?.id).concat(value ? [value] : []) };
  if (!policySchema.safeParse(updated).success) return deny('invalid_membership');
  if (s.principals.some(p => isSuperuser(s, p.id)) && !updated.principals.some(p => isSuperuser(updated, p.id)))
    return deny('last_superuser');
  if (isSuperuser(s, actorId)) return allow();
  const action = previous ? value ? 'edit' : 'delete' : 'create';
  for (const m of [previous, value].filter((m): m is Membership => m !== null)) {
    if (m.companyId === null) return deny('platform_access_required');
    if (!decide(s, { principalId: actorId, companyId: m.companyId, locationIds: m.locationIds,
      permission: `platform.members:${action}` }, true).allowed) return deny('administration_scope_missing');
    // Even a disabled assignment must not park excessive privileges for a later activation.
    for (const roleId of m.roleIds) {
      const role = s.roles.find(r => r.id === roleId)!;
      if (role.kind === 'superuser') return deny('platform_access_required');
      for (const p of role.permissions)
        if (!decide(s, { principalId: actorId, companyId: m.companyId, locationIds: m.locationIds, permission: p }).allowed)
          return deny('cannot_delegate_permission');
    }
  }
  return allow();
}

export function authorizeRoleChange(snapshot: unknown, actorId: string,
  before: unknown | null, after: unknown | null): Decision {
  const parsed = policySchema.safeParse(snapshot);
  if (!parsed.success || (!before && !after)) return deny('invalid_policy_or_request');
  const s = parsed.data;
  const old = before === null ? null : roleSchema.safeParse(before);
  const next = after === null ? null : roleSchema.safeParse(after);
  if ((old && !old.success) || (next && !next.success)) return deny('invalid_role');
  const previous = old?.success ? old.data : null, value = next?.success ? next.data : null;
  if (previous && !s.roles.some(r => JSON.stringify(r) === JSON.stringify(previous))) return deny('stale_role');
  if (value && (previous ? previous.id !== value.id || previous.companyId !== value.companyId : s.roles.some(r => r.id === value.id)))
    return deny('immutable_identity');
  const updated = { ...s, roles: s.roles.filter(r => r.id !== previous?.id).concat(value ? [value] : []) };
  // A referenced role must be deactivated, not deleted. Historical memberships
  // retain their role reference and cannot silently adopt a reused identifier.
  if (!policySchema.safeParse(updated).success) return deny('role_in_use');
  if (s.principals.some(p => isSuperuser(s, p.id)) && !updated.principals.some(p => isSuperuser(updated, p.id)))
    return deny('last_superuser');
  if (isSuperuser(s, actorId)) return allow();
  const action = previous ? value ? 'edit' : 'delete' : 'create';
  for (const role of [previous, value].filter((r): r is Role => r !== null)) {
    if (role.companyId === null || role.kind === 'superuser') return deny('platform_access_required');
    // Role edits affect every assignee, so location-limited admins cannot edit a
    // company-wide role definition, even if the current assignee list is empty.
    const q = { principalId: actorId, companyId: role.companyId, locationIds: null };
    if (!decide(s, { ...q, permission: `platform.roles:${action}` }, true).allowed)
      return deny('administration_scope_missing');
    for (const p of role.permissions)
      if (!decide(s, { ...q, permission: p }).allowed) return deny('cannot_delegate_permission');
  }
  return allow();
}
