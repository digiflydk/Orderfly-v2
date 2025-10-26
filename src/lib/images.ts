// src/lib/images.ts
export function safeImage(
  src?: string | null,
  fallback: string = '/placeholder/64x64.png'
) {
  if (!src) return fallback;
  try {
    // accept absolute http(s) or root-relative local paths
    if (src.startsWith('/')) return src;
    const u = new URL(src);
    return u.href;
  } catch {
    return fallback;
  }
}
