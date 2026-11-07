import { calendarDay } from './promotion-calendar';
/** Serialize controlled form state to the existing server-action contract. */
export function upsellFormData(values: Record<string, unknown>, id?: string): FormData {
  const data = new FormData();
  data.set('exclusionsSubmitted', '1');
  if (id) data.set('id', id);
  for (const key of ['headingSingular', 'headingPlural', 'brandId', 'upsellName', 'priority', 'description', 'imageUrl', 'offerType', 'discountType', 'discountValue']) {
    if (values[key] != null) data.set(key, String(values[key]));
  }
  for (const key of ['excludeProductIds', 'excludeCategoryIds', 'excludeComboIds', 'locationIds', 'offerProductIds', 'offerCategoryIds', 'orderTypes', 'activeDays', 'tags']) {
    for (const value of (values[key] as string[] | undefined) ?? []) data.append(key, value);
  }
  for (const key of ['triggerConditions', 'activeTimeSlots']) data.set(key, JSON.stringify(values[key] ?? []));
  for (const key of ['startDate', 'endDate']) {
    const date = values[key];
    data.set(key, date instanceof Date ? calendarDay(date)! : '');
  }
  if (values.isActive === true) data.set('isActive', 'on');
  return data;
}
