// Browser calls to the phase 1 customer API. The brand is addressed by its
// public slug; the session is the HttpOnly cookie the API sets.
export type PortalAnswer<T> = { ok: true; data: T } | { ok: false; error: string };

export async function portalRequest<T = Record<string, unknown>>(slug: string, path: string, body?: object): Promise<PortalAnswer<T>> {
  try {
    const response = await fetch(`/api/loyalty/${encodeURIComponent(slug)}/${path}`, {
      cache: 'no-store', credentials: 'same-origin',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, error: typeof data?.error === 'string' ? data.error : 'unavailable' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// Customer-facing Danish texts for the API's error codes.
export function portalErrorText(code: string): string {
  switch (code) {
    case 'rate_limited': return 'Du har prøvet mange gange. Vent lidt, og prøv igen.';
    case 'network': return 'Ingen forbindelse. Tjek din internetforbindelse, og prøv igen.';
    case 'program_inactive': return 'Klubben er ikke åben lige nu. Kig forbi igen senere.';
    case 'invalid_request': return 'Tjek dit navn og din e-mail, og prøv igen.';
    default: return 'Noget gik galt. Prøv igen om lidt.';
  }
}
