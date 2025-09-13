

'use client';

import { useCart } from "@/context/cart-context";
import { Badge } from "../ui/badge";
import type { Location } from "@/types";

export function DeliveryInfo({ location }: { location: Location }) {
    const { deliveryType } = useCart();
    
    // This component now only renders the delivery fee/min order badge
    // The opening hours are handled exclusively by the HeroBanner component.
    if (deliveryType !== 'delivery') {
        return null;
    }

    return (
        <div className="flex flex-col gap-2">
            <Badge variant="secondary" className="w-fit font-normal text-xs">
                Delivery price from: {location.deliveryFee.toFixed(0)} kr. & min. Order size: {location.minOrder.toFixed(0)} kr.
            </Badge>
        </div>
    )
}
