import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ShoppingBag, Truck } from 'lucide-react';

interface OrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliveryMethodSelected: (method: 'takeaway' | 'delivery') => void;
}

export function OrderModal({ open, onOpenChange, onDeliveryMethodSelected }: OrderModalProps) {
  const handlePickup = () => {
    console.log('Jeg tager med - Take away selected');
    onDeliveryMethodSelected('takeaway');
  };

  const handleDelivery = () => {
    console.log('Leverer til mig - Delivery selected');
    onDeliveryMethodSelected('delivery');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#FFF8F0] border-none max-w-[380px] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-[24px] text-[#2D2D2D] text-center uppercase" style={{ fontWeight: 700 }}>
            Vælg leveringsmetode
          </DialogTitle>
          <DialogDescription className="text-[#2D2D2D]/60 text-center text-[13px]">
            Vælg om du vil hente din pizza eller få den leveret
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-6 pb-6">
          {/* Two Options */}
          <div className="grid grid-cols-1 gap-4">
            {/* Jeg tager med */}
            <button
              onClick={handlePickup}
              className="relative bg-[#2D2D2D] hover:bg-[#2D2D2D]/90 text-white rounded-lg p-6 transition-all cursor-pointer group overflow-hidden"
            >
              {/* Discount Badge */}
              <div className="absolute top-0 left-0 bg-[#F26422] text-white px-3 py-1.5 rounded-br-lg text-[11px] uppercase tracking-wide" style={{ fontWeight: 700 }}>
                Spar 25 %
              </div>

              <div className="flex flex-col items-center text-center pt-4">
                {/* Icon */}
                <div className="mb-4 bg-white/10 rounded-full p-4">
                  <ShoppingBag className="h-12 w-12 text-white stroke-[1.5]" />
                </div>
                
                {/* Title */}
                <h3 className="text-[18px] mb-2 uppercase" style={{ fontWeight: 700 }}>
                  Jeg tager med
                </h3>
                
                {/* Description */}
                <p className="text-white/70 text-[12px] leading-relaxed">
                  Vi har din ordre klar til det valgte tidspunkt og pakket i take-away poser.
                </p>
              </div>
            </button>

            {/* Leverer til mig */}
            <button
              onClick={handleDelivery}
              className="relative bg-[#2D2D2D] hover:bg-[#2D2D2D]/90 text-white rounded-lg p-6 transition-all cursor-pointer group overflow-hidden"
            >
              {/* Discount Badge */}
              <div className="absolute top-0 left-0 bg-[#F26422] text-white px-3 py-1.5 rounded-br-lg text-[11px] uppercase tracking-wide" style={{ fontWeight: 700 }}>
                Gratis levering
              </div>

              <div className="flex flex-col items-center text-center pt-4">
                {/* Icon */}
                <div className="mb-4 bg-white/10 rounded-full p-4">
                  <Truck className="h-12 w-12 text-white stroke-[1.5]" />
                </div>
                
                {/* Title */}
                <h3 className="text-[18px] mb-2 uppercase" style={{ fontWeight: 700 }}>
                  Leverer til mig
                </h3>
                
                {/* Description */}
                <p className="text-white/70 text-[12px] leading-relaxed">
                  Vi leverer din ordre til din adresse til det valgte tidspunkt.
                </p>
              </div>
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
