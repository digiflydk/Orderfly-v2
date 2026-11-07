import { z } from 'zod';
export const kdsSettingsSchema = z.object({
  preorderMinutes: z.number().int().min(0).max(1440).default(30),
  warningMinutes: z.number().int().min(0).max(120).default(5),
  overdueMinutes: z.number().int().min(0).max(120).default(5),
  sleepWhenClosed: z.boolean().default(true),
}).strict();
export type KdsSettings = z.infer<typeof kdsSettingsSchema>;
export function parseKdsSettings(value: unknown): KdsSettings {
  const parsed = kdsSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : kdsSettingsSchema.parse({});
}
export function orderInstant(value: unknown): number | null {
  const input = value as { toDate?: () => Date } | null;
  const date = input?.toDate ? input.toDate() : value ? new Date(value as string) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}
export function kitchenReleaseAt(order: { fulfillmentAt?: unknown }, settings: KdsSettings): number | null {
  const at = orderInstant(order.fulfillmentAt);
  return at === null ? null : at - settings.preorderMinutes * 60_000;
}
export function isKitchenPreorder(order: { fulfillmentAt?: unknown; status: string }, now: number, settings: KdsSettings): boolean {
  const at = kitchenReleaseAt(order, settings);
  return order.status === 'Received' && at !== null && at > now;
}
export type KitchenHours = Record<string, { isOpen: boolean; open: string; close: string }>;
/** Missing or invalid hours never silence the kitchen. Supports overnight shifts. */
export function kitchenIsOpen(hours: KitchenHours | undefined, now: number): boolean {
  if (!hours || !Object.keys(hours).length) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const day = value('weekday').toLowerCase(), minutes = Number(value('hour')) * 60 + Number(value('minute'));
  const parse = (time: string) => /^\d{2}:\d{2}$/.test(time) && Number(time.slice(0,2)) < 24 && Number(time.slice(3)) < 60 ? Number(time.slice(0,2)) * 60 + Number(time.slice(3)) : null;
  const today = hours[day], yesterday = hours[names[(names.indexOf(day) + 6) % 7]];
  if (!today) return true;
  if (yesterday?.isOpen) {
    const start = parse(yesterday.open), end = parse(yesterday.close);
    if (start === null || end === null) return true;
    if (end <= start && minutes < end) return true;
  }
  if (!today.isOpen) return false;
  const start = parse(today.open), end = parse(today.close);
  if (start === null || end === null) return true;
  return end <= start ? minutes >= start : minutes >= start && minutes < end;
}
