import { randomUUID } from 'node:crypto';

// Unpredictable IDs and create-only persistence prevent overwriting an older order.
export function generateOrderId(): string {
  return `ORD-${randomUUID()}`;
}
