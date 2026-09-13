import 'server-only';
export function mpanelAdminEnabled() { return process.env.MPANEL_PLATFORM_ADMIN_ENABLED === 'true'; }
export function assertLegacyAdminWrite() {
  // Catalogue writes are retired independently of bridge availability. A disabled
  // bridge (including rollback) must not reopen unauthenticated Admin SDK writers.
  throw new Error('Administrér brugere, roller og abonnementsplaner i mPanel.');
}
export const MPANEL_ADMIN_URL = 'https://www.esmeraldapizza.dk/mpanel#platform';
