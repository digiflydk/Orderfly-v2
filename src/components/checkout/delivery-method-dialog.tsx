

'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/cart-context';
import { Truck, Store, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useAnalytics } from '@/context/analytics-context';

interface DeliveryMethodDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSelect?: () => void; // Optional callback
}

export function DeliveryMethodDialog({ isOpen, setIsOpen, onSelect }: DeliveryMethodDialogProps) {
  const { setDeliveryType, deliveryFee, freeDeliveryDiscountApplied, location } = useCart();
  const [internalDeliveryType, setInternalDeliveryType] = useState<'delivery' | 'pickup' | null>(null);
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    // Reset internal state when dialog opens so nothing is pre-selected
    if(isOpen) {
        setInternalDeliveryType(null);
    }
  }, [isOpen]);


  const handleSelect = (type: 'delivery' | 'pickup') => {
    setInternalDeliveryType(type); // Visuelt feedback med det samme
    setDeliveryType(type);
    trackEvent('delivery_method_selected', { method: type, deliveryFee });
    setIsOpen(false);
    if (onSelect) {
      onSelect();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
       <DialogContent 
        className="w-full sm:max-w-lg p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 border-0
                   bottom-0 rounded-t-2xl top-auto translate-y-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2
                   data-[state=closed]:slide-out-to-bottom sm:data-[state=closed]:slide-out-to-top-[48%]
                   data-[state=open]:slide-in-from-bottom sm:data-[state=open]:slide-in-from-top-[48%]"
      >
        <DialogHeader className="p-4 pb-4 text-left relative">
          <DialogTitle className="text-2xl font-bold">Delivery Method</DialogTitle>
          <DialogDescription>Do you want to order for pick-up or delivery? You can always change your choice later.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-4 pb-6 pt-0">
          
          {/* Pickup Button */}
          <button
            onClick={() => handleSelect('pickup')}
            className={cn(
                "flex items-center gap-4 p-2 rounded-lg border-2 text-left transition-colors",
                internalDeliveryType === 'pickup' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
            )}
          >
            <div className="flex-shrink-0 bg-secondary text-secondary-foreground p-3 rounded-md">
                <Store className="h-5 w-5" />
            </div>
            <span className="flex-grow font-semibold text-sm sm:text-base">Pick-up</span>
            {location?.pickupSaveTag && (
                <Badge variant="destructive" className="bg-red-100 text-red-700 border border-red-200 hover:bg-red-100/80">
                    <div className="h-2 w-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
                    Save {location.pickupSaveTag}
                </Badge>
            )}
          </button>
          
          {/* Delivery Button */}
          <button
            onClick={() => handleSelect('delivery')}
            className={cn(
                "flex items-center gap-4 p-2 rounded-lg border-2 text-left transition-colors",
                internalDeliveryType === 'delivery' ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
            )}
          >
             <div className="flex-shrink-0 bg-secondary text-secondary-foreground p-3 rounded-md">
                <Truck className="h-5 w-5" />
            </div>
            <span className="flex-grow font-semibold text-sm sm:text-base">Delivery</span>
            {freeDeliveryDiscountApplied && (
                 <Badge variant="destructive" className="bg-green-100 text-green-700 border border-green-200 hover:bg-green-100/80">
                    Free delivery
                </Badge>
            )}
          </button>

        </div>
      </DialogContent>
    </Dialog>
  );
}
