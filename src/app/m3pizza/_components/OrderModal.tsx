'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShoppingBag, Truck } from "lucide-react";

interface OrderModalProps {
  modes?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliveryMethodSelected: (method: 'takeaway' | 'delivery') => void;
}

export function OrderModal({ open, onOpenChange, onDeliveryMethodSelected, modes = ['pickup', 'delivery'] }: OrderModalProps) {

  const handlePickup = () => {
    onDeliveryMethodSelected('takeaway');
    onOpenChange(false);
  };

  const handleDelivery = () => {
    onDeliveryMethodSelected('delivery');
    onOpenChange(false);
  };

  const content = (
    <>
      <DialogHeader className="text-center p-6 pb-4">
        <DialogTitle className="text-xl font-bold uppercase text-m3-dark">Vælg leveringsmetode</DialogTitle>
        <DialogDescription className="text-sm text-neutral-600">
          Vælg om du vil hente din pizza eller få den leveret
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 gap-4 px-6 pb-6">
        <button
          disabled={!modes.includes('delivery')}
          onClick={handleDelivery}
          className="disabled:opacity-40 disabled:cursor-not-allowed relative bg-m3-dark hover:bg-m3-dark/90 text-white rounded-lg p-6 transition-all group overflow-hidden"
        >
          <div className="flex flex-col items-center text-center pt-4">
            <div className="mb-4 bg-white/10 rounded-full p-4">
              <Truck className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-lg font-bold uppercase">Leverer til mig</h3>
            <p className="text-white/70 text-xs leading-relaxed max-w-[280px] mx-auto mt-1">
              Vi leverer din ordre til din adresse til det valgte tidspunkt.
            </p>
          </div>
        </button>
        <button
          disabled={!modes.includes('pickup')}
          onClick={handlePickup}
          className="disabled:opacity-40 disabled:cursor-not-allowed relative bg-m3-dark hover:bg-m3-dark/90 text-white rounded-lg p-6 transition-all group overflow-hidden"
        >
          <div className="flex flex-col items-center text-center pt-4">
            <div className="mb-4 bg-white/10 rounded-full p-4">
              <ShoppingBag className="h-10 w-10 text-white" />
            </div>
            <h3 className="text-lg font-bold uppercase">Jeg tager med</h3>
            <p className="text-white/70 text-xs leading-relaxed max-w-[280px] mx-auto mt-1">
              Vi har din ordre klar til det valgte tidspunkt og pakket i take-away poser.
            </p>
          </div>
        </button>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onOpenChange(false); } }} className="p-0 border-none bg-m3-cream left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 max-w-none rounded-t-lg sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-sm sm:rounded-lg">
        {content}
      </DialogContent>
    </Dialog>
  );
}
