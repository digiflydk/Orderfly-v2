export async function resolveParams<T>(params: Promise<T>): Promise<T> {
  return params;
}

export async function resolveSearchParams<T extends Record<string, unknown>>(
  searchParams?: Promise<T>
): Promise<T> {
  return (searchParams ? await searchParams : ({} as T));
}
