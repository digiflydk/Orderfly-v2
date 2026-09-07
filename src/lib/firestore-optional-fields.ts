// Omit absent object properties at the write boundary. Preserve Firestore
// sentinels, Timestamp instances and Dates; never change global SDK validation.
export function omitUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map(entry => {
    if (entry === undefined) throw new Error('Undefined array entries cannot be stored.');
    return omitUndefinedFields(entry);
  }) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([,entry]) => entry !== undefined)
      .map(([key,entry]) => [key,omitUndefinedFields(entry)])) as T;
  }
  return value;
}
