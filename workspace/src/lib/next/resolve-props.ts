
// This function is now redundant with Next.js 15's built-in async/await support for props.
// However, we keep it as a lightweight wrapper to maintain consistency across the codebase
// and to easily handle optional searchParams.

import type { Query } from '@/types/next-async-props';

/**
 * Resolves the `params` promise from page props.
 * @param params The `params` promise from Next.js page props.
 * @returns The resolved params object.
 */
export async function resolveParams<T>(params: Promise<T>): Promise<T> {
  return params;
}

/**
 * Resolves the optional `searchParams` promise from page props.
 * @param searchParams The optional `searchParams` promise from Next.js page props.
 * @returns The resolved searchParams object, or an empty object if undefined.
 */
export async function resolveSearchParams<T extends Query = Query>(
  searchParams?: Promise<T>
): Promise<T> {
  return (searchParams ? await searchParams : ({} as T));
}
