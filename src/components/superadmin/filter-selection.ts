export function locationsAfterBrandChange(
  current: string[] | undefined,
  brandId: string,
  locations: { id: string; brandId: string }[],
): string[] {
  if (brandId === 'all') return current ?? []
  const allowed = new Set(locations.filter(location => location.brandId === brandId).map(location => location.id))
  return (current ?? []).filter(id => allowed.has(id))
}
