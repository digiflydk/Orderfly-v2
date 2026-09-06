export function handledUpsells(): string[] {
  try {
    const raw = sessionStorage.getItem('orderfly_handled_upsell');
    if (!raw) return [];
    try { const values = JSON.parse(raw); return Array.isArray(values) ? values.filter(v => typeof v === 'string') : [raw]; }
    catch { return [raw]; }
  } catch { return []; }
}
export function markUpsellHandled(id: string) {
  try { sessionStorage.setItem('orderfly_handled_upsell', JSON.stringify([...new Set([...handledUpsells(), id])])); } catch {}
}
