export function feedbackDate(value: unknown): string {
  if (value == null || value === '') return 'Dato mangler';
  const date = new Date(value as string);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }).format(date)
    : 'Dato mangler';
}
