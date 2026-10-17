// Display texts built only from numbers and descriptions the API returns; the
// rules behind them (stamps, rewards, expiry) stay in the backend.
export const stampWord = (count: number) => count === 1 ? 'stempel' : 'stempler';

export function nextRewardText(stamps: number, stampsRequired: number, rewardDescription: string) {
  const left = Math.max(0, stampsRequired - stamps), reward = rewardDescription.trim();
  const target = reward ? reward[0].toLocaleLowerCase('da-DK') + reward.slice(1) : 'næste belønning';
  return `${left} ${stampWord(left)} til ${target}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// Dates as Danish customers read them, in Danish time.
const DATE = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' });
export const danishDate = (epochMs: number) => DATE.format(new Date(epochMs));

// History rows (spec §4.4): what happened and where, never who at the counter did it.
const EVENT_LABELS: Record<string, string> = {
  stamp_added: 'Stempel', stamp_removed: 'Stempel fjernet', reward_earned: 'Belønning optjent', reward_redeemed: 'Belønning indløst',
  redemption_cancelled: 'Indløsning annulleret', stamps_expired: 'Stempler udløbet', reward_expired: 'Belønning udløbet',
};
const CHANNEL_LABELS: Record<string, string> = { dine_in: 'Spis her', takeaway: 'Takeaway', pickup: 'Afhentning', delivery: 'Levering' };

export function historyText(event: { type: string; quantity: number; channel: string | null }) {
  const label = EVENT_LABELS[event.type] ?? 'Hændelse';
  const count = ['stamp_added', 'stamp_removed', 'stamps_expired'].includes(event.type) && event.quantity > 1
    ? ` (${event.quantity} ${stampWord(event.quantity)})` : '';
  return { label: label + count, channel: event.channel ? CHANNEL_LABELS[event.channel] ?? null : null };
}
