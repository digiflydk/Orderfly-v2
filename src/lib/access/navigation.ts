export type NavigationAccess = { superuser: boolean; permissions: string[] };

// Display policy only. Every data operation must independently authorize its
// stored brand/location. Longest matching route wins for nested website pages.
const routes: Array<[string, string]> = [
  ['/superadmin/brands/websites', 'orderfly.website:view'],
  ['/superadmin/sales/orders', 'orderfly.orders:view'],
  ['/superadmin/sales/dashboard', 'orderfly.analytics:view'],
  ['/superadmin/customers', 'orderfly.customers:view'],
  ['/superadmin/products', 'orderfly.catalog:view'],
  ['/superadmin/brands', 'orderfly.catalog:view'],
  ['/superadmin/locations', 'orderfly.catalog:view'],
  ['/superadmin/categories', 'orderfly.catalog:view'],
  ['/superadmin/toppings', 'orderfly.catalog:view'],
  ['/superadmin/combos', 'orderfly.catalog:view'],
  ['/superadmin/upsells', 'orderfly.catalog:view'],
  ['/superadmin/discounts', 'orderfly.discounts:view'],
  ['/superadmin/standard-discounts', 'orderfly.discounts:view'],
  ['/superadmin/loyalty', 'orderfly.loyalty:view'],
  ['/superadmin/games', 'orderfly.website:view'],
  ['/superadmin/feedback', 'orderfly.feedback:view'],
  ['/superadmin/analytics', 'orderfly.analytics:view'],
  ['/superadmin/billing', 'orderfly.billing:view'],
];

export function canNavigate(href: string, access?: NavigationAccess | null): boolean {
  if (!access) return false;
  if (href === 'https://www.esmeraldapizza.dk/mpanel#platform') {
    return access.superuser || access.permissions.some(p => p === 'platform.members:view' || p === 'platform.roles:view');
  }
  if (access.superuser) return true;
  if (href === '/superadmin') return access.permissions.some(p => p.startsWith('orderfly.') && p.endsWith(':view'));
  const route = routes.find(([path]) => href === path || href.startsWith(path + '/'));
  return !!route && access.permissions.includes(route[1]);
}

export function filterNavigation<T extends { href?: string; children?: T[] }>(items: T[], access?: NavigationAccess | null): T[] {
  return items.flatMap(item => {
    if (item.children) {
      const children = filterNavigation(item.children, access);
      return children.length ? [{ ...item, children }] : [];
    }
    return item.href && canNavigate(item.href, access) ? [item] : [];
  });
}
