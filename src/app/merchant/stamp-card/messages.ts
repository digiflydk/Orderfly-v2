// Display helpers for the counter view. Every rule is decided by the backend;
// these only translate its codes and convert the typed amount.

export const QR_TOKEN = /^[a-f0-9]{64}$/;

export const kr = (ore: number) => new Intl.NumberFormat('da-DK', { maximumFractionDigits: 2 }).format(ore / 100);

// Kroner as typed at the counter ("149", "149,50") to øre; null when it is not an amount.
export function parseAmountOre(value: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

export const shortDate = (ms: number) =>
  new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeZone: 'Europe/Copenhagen' }).format(new Date(ms));

export const CHANNEL_LABELS: Record<string, string> = { dine_in: 'Dine-in', takeaway: 'Takeaway' };

// A fresh key per counter action; the same key is reused when the action is retried.
export function newIdempotencyKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function errorMessage(code: string, minimumAmountOre?: number): string {
  switch (code) {
    case 'qr_invalid': return 'QR-koden er udløbet. Bed kunden opdatere siden.';
    case 'member_not_found': return 'Kunden findes ikke.';
    case 'below_minimum':
      return minimumAmountOre === undefined ? 'Beløbet er under minimum og giver ikke stempel.'
        : `Beløbet er under ${kr(minimumAmountOre)} kr. og giver ikke stempel.`;
    case 'discount_excluded': return 'Køb med rabat eller kampagne giver ikke stempel.';
    case 'channel_not_allowed': return 'Kanalen giver ikke stempel.';
    case 'daily_limit': return 'Kunden har fået det maksimale antal stempler i dag.';
    case 'program_inactive': return 'Stempelkortet er slået fra.';
    case 'reward_not_available': return 'Belønningen er allerede indløst.';
    case 'reward_not_found': return 'Belønningen findes ikke.';
    case 'reward_expired': return 'Belønningen er udløbet.';
    case 'reward_wrong_location':
    case 'wrong_location': return 'Kortet gælder kun i en anden afdeling.';
    case 'no_active_stamps': return 'Kunden har ikke så mange stempler på kortet.';
    case 'rate_limited': return 'For mange opslag. Vent et øjeblik, og prøv igen.';
    case 'forbidden': return 'Du har ikke adgang til denne handling.';
    case 'unauthorized': return 'Du er logget ud. Log ind igen.';
    case 'idempotency_conflict': return 'Handlingen er allerede registreret med andre oplysninger. Start forfra.';
    case 'invalid_request': return 'Kontrollér oplysningerne, og prøv igen.';
    default: return 'Ingen forbindelse. Prøv igen.';
  }
}

// Network failures and unknown server errors may follow a commit: only a retry with the same key is safe.
export const isUncertain = (code: string) => code === 'unavailable' || code === 'network';
