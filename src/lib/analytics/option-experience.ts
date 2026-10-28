/** Matched interactions, not ratios of unrelated event totals. No monetary client values. */
export type ExperienceEvent = { name: string; brandId?: string; locationId?: string; sessionId?: string; interactionId?: string; interactionMode?: string; productId?: string; upsellId?: string; ts?: unknown };
export type ExperienceCounts = { editedOpened: number; savedEdits: number; opened: number; changed: number; added: number; withoutAdd: number; offers: number; accepted: number; rejected: number };
export function optionExperience(events: ExperienceEvent[]): ExperienceCounts {
  const edits = new Map<string, Set<string>>(), dialogs = new Map<string, Set<string>>(), offers = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.brandId || !event.locationId || !event.sessionId || !event.interactionId) continue;
    const isOption = event.name.startsWith('option_');
    const subject = isOption ? event.productId : event.upsellId;
    if (!subject) continue;
    const key = JSON.stringify([event.brandId, event.locationId, event.sessionId, subject, event.interactionId]);
    if (isOption && event.interactionMode !== 'add' && event.interactionMode !== 'edit') continue;
    const map = isOption ? event.interactionMode === 'edit' ? edits : dialogs : offers;
    const names = map.get(key) || new Set<string>(); names.add(event.name); map.set(key, names);
  }
  const measured = [...dialogs.values()].filter(names => names.has('option_dialog_opened'));
  const shown = [...offers.values()].filter(names => names.has('upsell_offer_shown'));
  const added = measured.filter(names => names.has('option_product_added')).length;
  const edited = [...edits.values()].filter(names => names.has('option_dialog_opened'));
  return { editedOpened: edited.length, savedEdits: edited.filter(names => names.has('option_product_added')).length, opened: measured.length, changed: measured.filter(names => names.has('option_selection_changed')).length,
    added, withoutAdd: measured.length - added, offers: shown.length,
    accepted: shown.filter(names => names.has('upsell_accepted')).length,
    rejected: shown.filter(names => names.has('upsell_rejected')).length };
}
