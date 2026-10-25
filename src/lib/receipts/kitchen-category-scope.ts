/** Optional display-label enrichment only. Caller must first authorize the native
 * order's brand/location. Products are brand-owned; categories are owned through
 * explicit native location membership, matching category writers and routing. */
export function kitchenCatalogLabelApplies(row: Record<string, unknown> | undefined, docId: string,
  brandId: string, locationId: string, product: boolean): boolean {
  if (!row || product && row.brandId !== brandId || row.id !== undefined && row.id !== docId
    || row.isActive !== true || row.deleted === true || row.isDeleted === true || row.deletedAt != null || row.isTestData === true) return false;
  const locations = row.locationIds;
  if (product && locations === undefined) return true;
  if (!Array.isArray(locations) || locations.length > 500 || !locations.every(value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value))) return false;
  return product && locations.length === 0 || locations.includes(locationId);
}
