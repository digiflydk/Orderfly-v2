// Firestore/network failures worth retrying: nothing was sent, and the next attempt can succeed.
export function transientReadError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return [4, 8, 10, 13, 14, 'deadline-exceeded', 'resource-exhausted', 'aborted', 'internal', 'unavailable', 'ETIMEDOUT', 'ECONNRESET'].includes(code as string | number);
}
