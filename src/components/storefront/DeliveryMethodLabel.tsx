import { deliveryMethodLabel } from '@/lib/delivery-method-labels';
import type { Location } from '@/types';

export function DeliveryMethodLabel({ location, mode }: { location?: Location | null; mode: 'pickup' | 'delivery' }) {
  const label = deliveryMethodLabel(location, mode);
  if (!label || !location?.deliveryTypes?.includes(mode)) return null;
  return <span data-delivery-method-label={mode} style={{ color: 'hsl(var(--primary-foreground))' }} className="inline-block min-w-0 max-w-full whitespace-normal break-words rounded-full bg-primary px-3 py-1 text-xs font-semibold leading-snug text-primary-foreground [overflow-wrap:anywhere]">{label}</span>;
}
