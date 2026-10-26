export type NavigationAccess = { superuser: boolean; permissions: string[] };

// Display policy only. Every data operation must independently authorize its
// stored brand/location. Longest matching route wins for nested website pages.
const routes: Array<[string, string]> = [
  ['/merchant/delivery', 'orderfly.catalog:view'],
  ['/superadmin/delivery', 'orderfly.catalog:view'],
  ['/merchant/orders', 'orderfly.orders:view'],
  ['/merchant/payments', 'orderfly.catalog:view'],
  ['/superadmin/dashboard', 'orderfly.analytics:view'],
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
  ['/superadmin/loyalty/score', 'orderfly.customer_score:view'],
  ['/superadmin/games', 'orderfly.website:view'],
  ['/superadmin/feedback', 'orderfly.feedback:view'],
  ['/superadmin/analytics', 'orderfly.analytics:view'],
  ['/superadmin/qr-codes', 'orderfly.qr_codes:view'],
];

const COUNTER = 'orderfly.stamp_cards:counter';
// Permissions a counter-only employee may hold. Other products' permissions (opsfly., platform.) add no Orderfly menu.
const COUNTER_ONLY = [COUNTER, 'orderfly.stamp_cards:redeem', 'orderfly.stamp_cards:correct'];

// Counter staff on a shared tablet see only the stamp-card counter view, without the admin menu.
export function counterOnly(access?: NavigationAccess | null): boolean {
  return !!access && !access.superuser && access.permissions.includes(COUNTER)
    && access.permissions.every(p => !p.startsWith('orderfly.') || COUNTER_ONLY.includes(p));
}

export function canNavigate(href: string, access?: NavigationAccess | null): boolean {
  if (!access) return false;
  if (href === '/merchant/receipts' || href.startsWith('/merchant/receipts/')) return false;
  if (href === '/superadmin/receipts' || href.startsWith('/superadmin/receipts/')) return access.superuser;
  if (href === '/superadmin/print-log' || href.startsWith('/superadmin/print-log/')) return access.superuser;
  if (href === '/merchant/printers' || href.startsWith('/merchant/printers/')) return false;
  if (href === '/superadmin/printers' || href.startsWith('/superadmin/printers/')) return access.superuser;
  if (href === '/merchant/redeem') return access.superuser || access.permissions.includes('orderfly.games:view');
  if (href === '/merchant/stamp-card') return access.superuser || access.permissions.includes(COUNTER);
  if (href === '/merchant') return access.superuser || access.permissions.includes(COUNTER) || access.permissions.some(p => p.startsWith('orderfly.') && p.endsWith(':view'));
  if (href === 'https://www.esmeraldapizza.dk/mpanel#platform') {
    return access.superuser || access.permissions.some(p => p === 'platform.members:view' || p === 'platform.roles:view');
  }
  if (access.superuser) return true;
  // Stamp-card administration: any of its tabs. The Loyalitet overview is exact; customer score is /superadmin/loyalty/score.
  if (href === '/superadmin/loyalty/stamp-card' || href.startsWith('/superadmin/loyalty/stamp-card/'))
    return ['settings', 'members', 'log'].some(action => access.permissions.includes(`orderfly.stamp_cards:${action}`));
  if (href === '/superadmin/loyalty') return access.permissions.includes('orderfly.stamp_cards:overview');
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
