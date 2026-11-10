/** Only these three public routes belong to the booking flow. */
export function websiteBookingStep(pathname: string): 1 | 2 | 3 | null {
  if (/%2f|%5c/i.test(pathname)) return null;
  let path: string;
  try { path = decodeURIComponent(pathname).normalize('NFC').toLowerCase().replace(/\/$/, ''); } catch { return null; }
  if (path === '/bordbooking') return 1;
  if (path === '/bordbooking/informationer') return 2;
  if (path === '/bordbooking/bekræftelse') return 3;
  return null;
}
export function websiteBookingPath(step: 1 | 2 | 3): string {
  return ['/bordbooking', '/bordbooking/informationer', '/bordbooking/bekr%C3%A6ftelse'][step - 1];
}
