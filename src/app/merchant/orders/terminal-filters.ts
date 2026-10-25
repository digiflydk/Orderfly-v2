import type { TerminalOrder } from '@/lib/orders/terminal-types';

export type TerminalHistoryFilters = { search: string; dateFrom: string; dateTo: string };
export const EMPTY_HISTORY_FILTERS: TerminalHistoryFilters = { search: '', dateFrom: '', dateTo: '' };

function validInstant(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const calendar = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Calendar dates are always restaurant-local, never device-local. */
export function terminalDay(value: string | null | undefined): string | null {
  const date = validInstant(value);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function terminalDateTime(value: string | null | undefined): string {
  const date = validInstant(value);
  return date ? new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : 'Tidspunkt mangler';
}

export function terminalDateHeading(value: string | null | undefined): string {
  const date = validInstant(value);
  return date ? new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date) : 'Tidspunkt mangler';
}

export function isFutureTerminalDay(order: Pick<TerminalOrder, 'fulfillmentAt'>, serverTime: string): boolean {
  const day = terminalDay(order.fulfillmentAt), today = terminalDay(serverTime);
  return !!day && !!today && day > today;
}

export function sortTerminalPreorders(orders: TerminalOrder[]): TerminalOrder[] {
  const time = (order: TerminalOrder) => validInstant(order.fulfillmentAt)?.getTime() ?? Infinity;
  return [...orders].sort((left, right) => time(left) - time(right) || left.id.localeCompare(right.id));
}

export function historyFilterError(filters: TerminalHistoryFilters): string | null {
  const validDay = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if ((filters.dateFrom && !validDay(filters.dateFrom)) || (filters.dateTo && !validDay(filters.dateTo))) return 'Vælg en gyldig dato.';
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) return 'Fra-dato skal ligge før eller på til-dato.';
  return null;
}
