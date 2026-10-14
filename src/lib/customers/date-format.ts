/** Format a Copenhagen calendar date without interpreting it in the viewer's timezone. */
export function formatDirectoryDate(value: string | null | undefined): string {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${Number(day)}.${Number(month)}.${year}`;
}
