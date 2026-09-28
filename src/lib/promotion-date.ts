/** Read historical Firestore and ISO date representations without assuming a Timestamp. */
export function promotionDate(value: unknown): Date | undefined {
  if (value == null || value === '') return undefined;
  try {
    let raw = value;
    if (typeof (value as { toDate?: unknown }).toDate === 'function') {
      raw = (value as { toDate: () => Date }).toDate();
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      const timestamp = value as { seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown };
      const seconds = timestamp.seconds ?? timestamp._seconds;
      const nanos = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
      if (typeof seconds !== 'number' || typeof nanos !== 'number') return undefined;
      raw = seconds * 1000 + nanos / 1_000_000;
    }
    if (typeof raw !== 'string' && typeof raw !== 'number' && !(raw instanceof Date)) return undefined;
    const date = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw);
    return Number.isFinite(date.getTime()) ? date : undefined;
  } catch {
    return undefined;
  }
}
