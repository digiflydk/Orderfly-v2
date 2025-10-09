
'use client';

import { useEffect, useRef, useState } from 'react';
import { Truck, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { Badge } from '../ui/badge';
import type { Location } from '@/types';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { getLocationBySlug } from '@/app/superadmin/locations/actions';

type Payload = { brandSlug: string; locationSlug: string };

let _open: ((p: Payload) => void) | null = null;

/** Kan kaldes fra andre klientkomponenter for at åbne modal */
export function openDeliveryModal(p: Payload) {
  if (_open) _open(p);
}

export default function DeliveryMethodModal() {
  const [isOpen, setOpen] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const payloadRef = useRef<Payload | null>(null);
  const router = useRouter();
  const { setDeliveryType, freeDeliveryDiscountApplied } = useCart();

  useEffect(() => {
    _open = async (p: Payload) => {
      payloadRef.current = p;
      setOpen(true);
      // Fetch location data when modal opens
      if (p.locationSlug && p.brandSlug) {
        const brand = await getBrandBySlug(p.brandSlug);
        if(brand) {
            const loc = await getLocationBySlug(brand.id, p.locationSlug);
            setLocation(loc);
        }
      }
    };
    return () => { _open = null; };
  }, []);

  function close() {
    setOpen(false);
  }

  function choose(method: 'pickup' | 'delivery') {
    if (!payloadRef.current) return;
    try { 
        localStorage.setItem('deliveryMethod', method); 
    } catch {}
    
    setDeliveryType(method);
    const { brandSlug, locationSlug } = payloadRef.current;
    
    router.push(`/${brandSlug}/${locationSlug}`);
    
    setOpen(false);
  }

  if (!isOpen) return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1000]">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl w-[92%] max-w-lg">
        <div className="p-6">
          <h3 className="text-xl font-semibold">Delivery method</h3>
          <p className="text-sm text-gray-600 mt-2">
            Do you want to order for pick-up or delivery? You can always change your choice later.
          </p>

          <div className="mt-4 space-y-3">
            <button
              className="w-full flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50"
              onClick={() => choose('pickup')}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-yellow-100">
                  <Store className="h-4 w-4" />
                </span>
                <span className="font-medium">Pick-up</span>
              </span>
              {location?.pickupSaveTag && (
                <Badge variant="destructive" className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100/80">
                    <div className="h-2 w-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
                    Save {location.pickupSaveTag}
                </Badge>
              )}
            </button>

            <button
              className="w-full flex items-center justify-between border rounded-xl px-4 py-3 hover:bg-gray-50"
              onClick={() => choose('delivery')}
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-yellow-100">
                  <Truck className="h-4 w-4" />
                </span>
                <span className="font-medium">Delivery</span>
              </span>
              {freeDeliveryDiscountApplied && (
                 <Badge variant="destructive" className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100/80">
                    Free delivery
                </Badge>
              )}
            </button>
          </div>

          <div className="mt-5 flex justify-end">
            <button className="px-4 py-2 text-gray-600 hover:text-gray-800" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
