// src/lib/order-id.ts

/**
 * Generates a unique, consistent order ID in the format "ORD-######".
 * @returns {string} The generated order ID.
 */
export function generateOrderId(): string {
  // Always use "ORD-" prefix, not "0RD-".
  const randomPart = Math.floor(Math.random() * 900000) + 100000; // Generates a number between 100000 and 999999
  return `ORD-${randomPart}`;
}
