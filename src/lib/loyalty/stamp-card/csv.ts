// Same CSV conventions as the quality report: semicolon-separated, UTF-8 BOM
// for Excel, and formula characters neutralized against CSV injection.
const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map(row => row.map(cell).join(';')).join('\r\n');

export function downloadCsv(name: string, rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

const dateTime = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' });
const date = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeZone: 'Europe/Copenhagen' });
export const formatDateTime = (at: number | null | undefined) => at ? dateTime.format(new Date(at)) : '—';
export const formatDate = (at: number | null | undefined) => at ? date.format(new Date(at)) : '—';
export const formatKr = (ore: number | null | undefined) => ore == null ? '—' : (ore / 100).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

export const EVENT_LABELS: Record<string, string> = {
  member_joined: 'Tilmeldt', stamp_added: 'Stempel givet', stamp_removed: 'Stempel fjernet', reward_earned: 'Belønning optjent',
  reward_redeemed: 'Belønning indløst', redemption_cancelled: 'Indløsning annulleret', stamps_expired: 'Stempel udløbet',
  reward_expired: 'Belønning udløbet', consent_given: 'Samtykke givet', consent_withdrawn: 'Samtykke trukket tilbage',
  settings_changed: 'Indstilling ændret', member_deleted: 'Medlem slettet',
};
export const CHANNEL_LABELS: Record<string, string> = { dine_in: 'Dine-in', takeaway: 'Takeaway', pickup: 'Afhentning', delivery: 'Levering', email: 'E-mail' };
export const SOURCE_LABELS: Record<string, string> = {
  counter_qr: 'Kasse (QR)', counter_search: 'Kasse (via søgning)', order: 'Orderfly-ordre', portal: 'Kundeportal', admin: 'Administration', correction: 'Manuel korrektion', job: 'Automatisk',
};
