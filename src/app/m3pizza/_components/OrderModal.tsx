'use client';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { ShoppingBag, Truck } from "lucide-react";

interface OrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliveryMethodSelected: (method: 'takeaway' | 'delivery') => void;
}

export function OrderModal({ open, onOpenChange, onDeliveryMethodSelected }: OrderModalProps) {
  const isMobile = useIsMobile();

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
          onClick={handleDelivery}
          className="relative bg-m3-dark hover:bg-m3-dark/90 text-white rounded-lg p-6 transition-all group overflow-hidden"
        >
          <div className="absolute top-0 left-0 bg-m3-orange text-m3-dark px-3 py-1.5 rounded-br-lg text-[10px] uppercase font-bold tracking-wide">
            Gratis levering
          </div>
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
          onClick={handlePickup}
          className="relative bg-m3-dark hover:bg-m3-dark/90 text-white rounded-lg p-6 transition-all group overflow-hidden"
        >
          <div className="absolute top-0 left-0 bg-m3-orange text-m3-dark px-3 py-1.5 rounded-br-lg text-[10px] uppercase font-bold tracking-wide">
            Spar 25 %
          </div>
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

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="p-0 border-none bg-m3-cream rounded-t-lg">
            {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 border-none bg-m3-cream max-w-sm rounded-lg">
        {content}
      </DialogContent>
    </Dialog>
  );
}
