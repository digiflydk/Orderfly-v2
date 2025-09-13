
'use client';

import Image from "next/image";
import { useState, useMemo } from "react";
import type { ComboMenu, Product, ProductForMenu } from "@/types";
import { useCart } from "@/context/cart-context";
import { ComboBuilderDialog } from "./combo-builder-dialog";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

interface ComboCardProps {
  combo: ComboMenu;
  brandProducts: ProductForMenu[];
}

export function ComboCard({ combo, brandProducts }: ComboCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { deliveryType } = useCart();
  
  const price = useMemo(() => (deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice), [deliveryType, combo]);

  return (
    <>
      <div 
        className="group flex items-stretch gap-2 cursor-pointer transition-all duration-200 ease-in-out border-b py-4 md:border md:p-3 md:rounded-lg md:shadow-sm md:hover:shadow-lg md:hover:-translate-y-0.5"
        onClick={() => setIsDialogOpen(true)}
      >
        <div className="flex-1 flex flex-col space-y-1">
           <div>
            <h4 className="font-semibold text-sm">{combo.comboName}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{combo.description}</p>
           </div>
          <div className="flex items-center gap-2 pt-1 mt-auto">
             <p className="font-semibold text-sm text-primary">DKK {price?.toFixed(2) ?? 'N/A'}</p>
          </div>
        </div>
        <div className="relative w-36 h-[99px] shrink-0">
          <Image
            src={combo.imageUrl || 'https://placehold.co/400x225.png'}
            alt={combo.comboName}
            fill
            className="object-cover rounded-md"
            data-ai-hint="burger fries"
          />
           <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
                {combo.tags?.map(tag => (
                    <Badge 
                        key={tag} 
                        className="border-white/50 bg-black/20 text-white backdrop-blur-sm"
                    >
                        {tag}
                    </Badge>
                ))}
            </div>
        </div>
      </div>
      <ComboBuilderDialog
        combo={combo}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        brandProducts={brandProducts}
      />
    </>
  );
}
