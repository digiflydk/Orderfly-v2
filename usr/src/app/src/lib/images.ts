

// src/lib/images.ts
export function safeImage(
  src?: string | null,
  fallback: string = 'https://placehold.co/128x128/EFEFEF/7F7F7F?text=Image'
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
