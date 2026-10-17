// Customer portal (stamp card phase 2) addresses. On a brand subdomain the
// browser path is /club/…; on orderfly.dk it is /{slug}/club/…. Pure helpers.

export function isClubPath(pathname: string | null | undefined, slug: string): boolean {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  return (segments[0] === slug ? segments[1] : segments[0]) === 'club';
}

export const clubBase = (onBrandSubdomain: boolean, slug: string) => onBrandSubdomain ? '/club' : `/${slug}/club`;
