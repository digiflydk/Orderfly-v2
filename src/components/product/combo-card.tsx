
'use client';

import Image from "next/image";
import { useState, useMemo } from "react";
import type { ComboMenu, Product, ProductForMenu } from "@/types";
import { useCart } from "@/context/cart-context";
import { ComboBuilderDialog } from "./combo-builder-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Plus } from "lucide-react";

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
        className="group flex w-full items-start gap-4 cursor-pointer border-b py-4"
        onClick={() => setIsDialogOpen(true)}
      >
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md">
          <Image
            src={combo.imageUrl || 'https://placehold.co/400x400.png'}
            alt={combo.comboName}
            fill
            sizes="(max-width: 768px) 25vw, 15vw"
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

        <div className="flex-1 flex flex-col h-full">
          <div className="flex-1">
            <h4 className="font-semibold">{combo.comboName}</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">{combo.description}</p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="font-semibold text-foreground">kr. {price?.toFixed(2) ?? 'N/A'}</p>
            <Button size="icon" className="h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shrink-0">
              <Plus className="h-5 w-5"/>
            </Button>
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
