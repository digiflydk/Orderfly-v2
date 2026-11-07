import type { TerminalOrder } from './terminal-types';
export function kitchenDay(value: string | number | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function kitchenDeadline(order: TerminalOrder): string | null {
  const value = order.kitchenReadyAt || (order.managedDelivery ? order.managedDeliveryTracking?.pickupInterval?.earliest : null) || order.fulfillmentAt;
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function kitchenCountdown(deadline: string | null, now: number): string {
  if (!deadline) return 'Tid ikke angivet';
  const seconds = Math.ceil((Date.parse(deadline) - now) / 1000);
  const absolute = Math.abs(seconds);
  return `${seconds < 0 ? '−' : ''}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')}`;
}
export function kitchenOverdue(order: TerminalOrder, now: number, minutes: number): boolean {
  const deadline = kitchenDeadline(order);
  return ['Received', 'In Progress'].includes(order.status) && !!deadline && now >= Date.parse(deadline) + minutes * 60_000;
}
