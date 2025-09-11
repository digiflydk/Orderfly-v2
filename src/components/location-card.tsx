
'use client';

import Image from "next/image";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Truck, Clock } from "lucide-react";

import type { Location } from "@/types";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { openDeliveryModal } from "./modals/DeliveryMethodModal";

interface LocationCardProps {
  location: Location & { brandSlug: string };
}

export function LocationCard({ location }: LocationCardProps) {
  const [openingStatus, setOpeningStatus] = useState<string>('Checking...');
  const [isOpenNow, setIsOpenNow] = useState<boolean>(false);
  const [nextOpeningTime, setNextOpeningTime] = useState('');

  useEffect(() => {
    const checkOpeningStatus = () => {
      const now = new Date();
      const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
      
      const todaysHours = location.openingHours?.[dayOfWeek as keyof typeof location.openingHours];

      if (todaysHours && todaysHours.isOpen) {
        const [openHour, openMinute] = todaysHours.open.split(':').map(Number);
        const [closeHour, closeMinute] = todaysHours.close.split(':').map(Number);

        const openDate = new Date();
        openDate.setHours(openHour, openMinute, 0, 0);

        const closeDate = new Date();
        closeDate.setHours(closeHour, closeMinute, 0, 0);

        if (closeDate < openDate) {
          closeDate.setDate(closeDate.getDate() + 1);
        }
        
        const isOpen = now >= openDate && now < closeDate;
        setIsOpenNow(isOpen);
        setNextOpeningTime(todaysHours.open);
        setOpeningStatus(isOpen ? `Open | Closes at ${todaysHours.close}` : `Closed`);
      } else {
        setIsOpenNow(false);
        setOpeningStatus('Closed');
         for (let i = 1; i <= 7; i++) {
          const nextDayIndex = (now.getDay() + i) % 7;
          const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDayIndex].toLowerCase();
          const nextDayHours = location.openingHours?.[nextDayName as keyof typeof location.openingHours];
          if (nextDayHours && nextDayHours.isOpen) {
            setNextOpeningTime(nextDayHours.open);
            break;
          }
        }
      }
    };

    checkOpeningStatus();
    const interval = setInterval(checkOpeningStatus, 60000); 
    return () => clearInterval(interval);

  }, [location.openingHours]);

  
  const onSelect = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openDeliveryModal({ brandSlug: location.brandSlug, locationSlug: location.slug });
  }, [location.brandSlug, location.slug]);

  const getOpeningStatusText = () => {
    if (isOpenNow) {
        return openingStatus;
    }
    if (location.allowPreOrder) {
      return `Pre-order | Opens at ${nextOpeningTime}`;
    }
    return `${openingStatus} | Opens at ${nextOpeningTime}`;
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full text-left"
      aria-label={`Choose ${location.name}`}
    >
      <Card className="relative w-full overflow-hidden transition-all duration-300 h-64 rounded-lg border-0 bg-transparent group-hover:shadow-xl group-hover:-translate-y-1">
          <Image
              src={location.imageUrl || `https://placehold.co/400x300.png`}
              alt={location.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              data-ai-hint="restaurant storefront"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
              {location.supportsDelivery && (
                <Badge variant="secondary" className="text-xs font-medium bg-black/20 text-white backdrop-blur-sm border-white/50">
                    <Truck className="h-3 w-3 mr-1.5" />
                    Delivery
                </Badge>
              )}
              {location.supportsPickup && (
                  <Badge variant="secondary" className="text-xs font-medium bg-black/20 text-white backdrop-blur-sm border-white/50">
                      <Store className="h-3 w-3 mr-1.5" />
                      Pickup
                  </Badge>
              )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              <h3 className="text-xl font-bold">{location.name}</h3>
              <div className="text-sm opacity-90">
                <p>{location.street}</p>
                <p>{location.zipCode} {location.city}</p>
              </div>
               <Badge
                variant="outline"
                className={cn(
                    "mt-2 border-white/50 bg-black/20 text-white backdrop-blur-sm",
                    (isOpenNow || location.allowPreOrder) ? "border-green-400" : "border-red-400"
                )}
                >
                <Clock className="h-3 w-3 mr-1.5" />
                {getOpeningStatusText()}
               </Badge>
          </div>
    </Card>
    </button>
  );
}
