import type { AppTypes } from '@/types/next-async-props';

/**
 * Safely extracts a string from searchParams.
 * @param query The resolved searchParams object.
 * @param key The key to look for.
 * @returns The string value or undefined.
 */
export function qStr(query: AppTypes.Query, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely extracts a boolean from searchParams.
 * @param query The resolved searchParams object.
 * @param key The key to look for.
 * @returns The boolean value or undefined.
 */
export function qBool(query: AppTypes.Query, key: string): boolean | undefined {
  const value = query[key];
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

/**
 * Safely extracts an integer from searchParams.
 * @param query The resolved searchParams object.
 * @param key The key to look for.
 * @returns The number value or undefined.
 */
export function qInt(query: AppTypes.Query, key: string): number | undefined {
  const value = query[key];
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}
