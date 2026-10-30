/** Customer display only. Keep provider intervals unchanged in storage and contracts. */
export function customerDeliveryEstimate(interval: { earliest: string; latest: string } | null | undefined): string | null {
  if (!interval || typeof interval.earliest !== 'string' || typeof interval.latest !== 'string') return null;
  const earliest = Date.parse(interval.earliest), latest = Date.parse(interval.latest);
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || earliest > latest) return null;
  // The later bound is the conservative single estimate, never a promised exact time.
  return `ca. ${new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(latest))}`;
}
