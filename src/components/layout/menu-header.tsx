
'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

import type { Brand, TimeSlotResponse } from "@/types";
import { getTimeSlots } from "@/app/superadmin/locations/actions";
import { useCart } from "@/context/cart-context";
import { TimeSelector } from "../checkout/time-selector";

interface MenuHeaderProps {
  brand: Brand;
}

export function MenuHeader({ brand }: MenuHeaderProps) {
  const { location } = useCart();
  const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);

  useEffect(() => {
    if (location?.id) {
        getTimeSlots(location.id).then(setTimeSlots);
    }
  }, [location?.id]);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-[#FFF8F0]">
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-center md:justify-between px-4">
        <Link href={`/${brand.slug}`} className="flex items-center">
          {brand.logoUrl ? (
            <div className="relative h-12 w-24">
                <Image
                    src={brand.logoUrl}
                    alt={`${brand.name} logo`}
                    fill
                    className="object-contain"
                    data-ai-hint="logo"
                />
            </div>
          ) : (
            <span className="font-bold">{brand.name}</span>
          )}
        </Link>
        <div className="hidden lg:flex items-center gap-2">
            <TimeSelector timeSlots={timeSlots} />
        </div>
      </div>
    </header>
  );
}
