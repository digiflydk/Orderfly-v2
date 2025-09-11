

'use client';

import type { Location } from '@/types';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Clock, Truck, Store, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCart } from '@/context/cart-context';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface HeroBannerProps {
  location: Location;
}

export function HeroBanner({ location }: HeroBannerProps) {
  const { deliveryType } = useCart();
  const [openingStatusText, setOpeningStatusText] = useState('Checking...');
  const [statusVariant, setStatusVariant] = useState<'default' | 'destructive' | 'outline'>('outline');
  
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
        if(isOpen) {
            setOpeningStatusText(`Open | Closes at ${todaysHours.close}`);
            setStatusVariant('default');
        } else {
            let nextOpenDay = '';
            for (let i = 1; i <= 7; i++) {
                const nextDayIndex = (now.getDay() + i) % 7;
                const nextDayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][nextDayIndex].toLowerCase();
                const nextDayHours = location.openingHours?.[nextDayName as keyof typeof location.openingHours];
                if (nextDayHours && nextDayHours.isOpen) {
                    nextOpenDay = `${nextDayName.charAt(0).toUpperCase() + nextDayName.slice(1)} at ${nextDayHours.open}`;
                    break;
                }
            }
            setOpeningStatusText(location.allowPreOrder ? `Pre-order | Opens ${nextOpenDay}` : `Closed | Opens ${nextOpenDay}`);
            setStatusVariant(location.allowPreOrder ? 'default' : 'destructive');
        }
      } else {
         setOpeningStatusText('Closed');
         setStatusVariant('destructive');
      }
    };

    // Run on mount and then every minute
    checkOpeningStatus();
    const interval = setInterval(checkOpeningStatus, 60000); 
    return () => clearInterval(interval);

  }, [location.openingHours, location.allowPreOrder]);

  return (
    <div className="relative h-72 lg:h-[332px] w-full overflow-hidden lg:rounded-lg lg:max-w-[1140px] lg:mx-auto lg:px-6 pt-12 pb-6">
      <Image
        src={location.imageUrl || 'https://placehold.co/1200x400.png'}
        alt={location.name}
        fill
        sizes="(max-width: 1140px) 100vw, 1140px"
        className="object-cover"
        data-ai-hint="restaurant storefront"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10" />
      <div className="absolute inset-0 px-4 flex flex-col justify-end lg:max-w-[1140px] lg:mx-auto z-20">
          <div className="absolute top-4 flex flex-wrap items-center gap-2 text-sm">
            {location.supportsDelivery && (
              <Badge variant="outline" className="border-white/50 bg-black/20 text-white backdrop-blur-sm">
                <Truck className="h-3 w-3 mr-1.5" />
                Delivery
              </Badge>
            )}
            {location.supportsPickup && (
              <Badge variant="outline" className="border-white/50 bg-black/20 text-white backdrop-blur-sm">
                <Store className="h-3 w-3 mr-1.5" />
                Pick-up
              </Badge>
            )}
          </div>

          <div className="bottom-0 left-0 right-0 p-4 md:p-8 text-white -mx-4 md:-mx-8">
            <h1 className="text-xl md:text-4xl font-bold">{location.name}</h1>
            <div className="text-sm md:text-lg">
              <p>{location.street}</p>
              <p>{location.zipCode} {location.city}</p>
            </div>
            <div className="mt-2 flex items-center">
              <Badge
                variant={statusVariant === 'default' ? 'default' : (statusVariant === 'destructive' ? 'destructive' : 'outline')}
                className={cn(
                  "border-white/50 bg-black/20 text-white backdrop-blur-sm text-sm",
                  statusVariant === 'default' && "border-green-400 bg-green-500/30",
                  statusVariant === 'destructive' && "border-red-400 bg-red-500/30"
                )}
              >
                <Clock className="h-3 w-3 mr-1.5" />
                {openingStatusText}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {deliveryType === 'delivery' && (
                 <Badge variant="outline" className="border-white/50 bg-black/20 text-white backdrop-blur-sm font-normal text-[11px]">
                    Delivery price from: {location.deliveryFee.toFixed(0)} kr. & min. Order size: {location.minOrder.toFixed(0)} kr.
                </Badge>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
