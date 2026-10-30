

'use client';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { money } from '@/lib/money';
import { comboMinimumAdjustments } from '@/lib/combo-pricing';

import {formatPrice} from '@/lib/storefront-format';
import Image from "next/image";
import { useState, useMemo } from "react";
import type { ComboMenu, Product, ProductForMenu } from "@/types";
import { useCart } from "@/context/cart-context";
import dynamic from 'next/dynamic';
const ComboBuilderDialog = dynamic(() => import('./combo-builder-dialog').then(module => module.ComboBuilderDialog));
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";
import { safeImage } from "@/lib/images";

interface ComboCardProps {
  combo: ComboMenu;
  brandProducts: ProductForMenu[];
}

export function ComboCard({ combo, brandProducts }: ComboCardProps) {
  const isV2 = useStorefrontV2();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { deliveryType } = useCart();
  
  const price = useMemo(() => {
    const amount = deliveryType === 'delivery' ? combo.deliveryPrice : combo.pickupPrice;
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? money(amount + comboMinimumAdjustments(combo)) : undefined;
  }, [deliveryType, combo]);

  return (
    <>
      <div data-v2-product-card={isV2 || undefined}
        className="group flex w-full items-start gap-4 cursor-pointer border-b py-4"
        onClick={() => { if (price !== undefined) setIsDialogOpen(true); }}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md">
          <Image
            src={safeImage(combo.imageUrl)}
            alt={combo.comboName}
            fill
            sizes="96px"
            className="object-cover"
            data-ai-hint="delicious food"
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

        <div className="min-w-0 flex-1 flex flex-col h-full">
          <div className="flex-1">
            <h3 className="font-semibold"><button type="button" aria-label={`Se ${combo.comboName}`} onClick={event=>{event.stopPropagation();if(price!==undefined)setIsDialogOpen(true);}}>{combo.comboName}</button></h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{combo.description}</p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="font-semibold text-foreground">{price===undefined?'Ikke tilgængelig':`Fra ${formatPrice(price)}`}</p>
            <Button disabled={price === undefined} type="button" aria-label={`Tilføj ${combo.comboName}`} size={isV2 ? "default" : "icon"} className={`h-11 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shrink-0 ${isV2 ? "px-4" : "w-11"}`}>
              {isV2 ? "Vælg menu" : <Plus className="h-5 w-5"/>}
            </Button>
          </div>
        </div>
      </div>
      {isDialogOpen && <ComboBuilderDialog
        combo={combo}
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        brandProducts={brandProducts}
      />}
    </>
  );
}
