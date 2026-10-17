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
