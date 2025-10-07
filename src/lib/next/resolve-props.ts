
export async function resolveParams<T>(params: Promise<T>): Promise<T> {
  return params; // Semantisk tydelighed + mulighed for udskiftning, hvis Next ændrer form igen
}

export async function resolveSearchParams<T extends Record<string, unknown>>(
  searchParams?: Promise<T>
): Promise<T> {
  return (searchParams ? await searchParams : ({} as T));
}
