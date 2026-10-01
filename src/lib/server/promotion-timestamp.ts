import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { promotionDay, savedPromotionDate } from '@/lib/promotion-calendar';

/** An unchanged Firestore instant must retain nanoseconds, not round-trip through Date. */
export function savedPromotionTimestamp(day: string, previous: unknown, end = false): Timestamp {
  if (previous instanceof Timestamp && promotionDay(previous) === day) return previous;
  return Timestamp.fromDate(savedPromotionDate(day, previous, end));
}
