

'use client';
import DeliveryMethodModal from "@/components/modals/DeliveryMethodModal";

/**
 * Ensures modals are rendered on the client after the page has hydrated.
 */
export default function DeliveryModalHost() {
  return <DeliveryMethodModal />;
}
