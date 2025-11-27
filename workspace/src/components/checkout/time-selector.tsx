
'use client';

import { useCart } from "@/context/cart-context";
import { Button } from "../ui/button";
import { Truck, Clock, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState, useMemo } from "react";
import type { TimeSlotResponse } from "@/types";
import { Skeleton } from "../ui/skeleton";
import { TimeSlotDialog } from "./timeslot-dialog";
import { calculateTimeSlots } from '@/app/superadmin/locations/client-actions';

function TimeSlotSkeleton() {
    return (
        <div className="flex items-center justify-between rounded-lg border bg-card p-2 px-3">
            <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Skeleton className="h-5 w-24" />
            </div>
             <Skeleton className="h-8 w-16" />
        </div>
    )
}

interface TimeSelectorProps {
    timeSlots: TimeSlotResponse | null;
}


export function TimeSelector({ timeSlots }: TimeSelectorProps) {
    const { deliveryType, setDeliveryType, location, selectedTime } = useCart();
    const [isTimeDialogOpen, setIsTimeDialogOpen] = useState(false);
    
    if (!location) return null;
    
    const asapText = useMemo(() => {
        if (!timeSlots) return "Loading...";
        const text = deliveryType === 'delivery' ? timeSlots.asap_delivery : timeSlots.asap_pickup;
        return text || "Currently unavailable";
    }, [timeSlots, deliveryType]);
    
    const displayTime = selectedTime === 'asap' ? asapText : selectedTime;

    return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
             <div className="grid grid-cols-2 gap-1 rounded-lg border p-1 bg-background">
                 <Button
                    variant={deliveryType === 'pickup' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setDeliveryType('pickup')}
                    className={cn(
                        "h-auto flex flex-1 items-center justify-center gap-2 rounded-md border-0 px-2 py-2 text-sm font-semibold transition-all duration-200",
                        deliveryType !== 'pickup' && "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                >
                    <Store className="h-4 w-4" />
                    <span>Pick-up</span>
                </Button>
                <Button
                    variant={deliveryType === 'delivery' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setDeliveryType('delivery')}
                    className={cn(
                        "h-auto flex flex-1 items-center justify-center gap-2 rounded-md border-0 px-2 py-2 text-sm font-semibold transition-all duration-200",
                         deliveryType !== 'delivery' && "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                >
                    <Truck className="h-4 w-4" />
                    <span>Delivery</span>
                </Button>
            </div>
            <div className="flex items-center justify-between border rounded-lg bg-card p-2 px-3 flex-1">
                 {!timeSlots ? (
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /><Skeleton className="h-5 w-24" /></div>
                 ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-semibold">{displayTime}</span>
                        </div>
                        <Button variant="link" size="sm" className="h-auto p-0 ml-2 text-xs" onClick={() => setIsTimeDialogOpen(true)}>
                            Change
                        </Button>
                    </>
                 )}
            </div>

             <TimeSlotDialog
                isOpen={isTimeDialogOpen}
                setIsOpen={setIsTimeDialogOpen}
                locationId={location.id}
             />
        </div>
    )
}
