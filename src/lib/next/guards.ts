import { notFound } from 'next/navigation';

/**
 * Ensures a required parameter exists and is a non-empty string.
 * If not, it triggers a `notFound()` response.
 * @param params The resolved route parameters object.
 * @param key The key of the parameter to check.
 * @returns The parameter value if it exists.
 */
export function requireParam(params: Record<string, string>, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value) {
    notFound();
  }
  return value;
}
