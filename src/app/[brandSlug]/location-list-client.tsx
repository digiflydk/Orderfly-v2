'use client';

import type { Location } from '@/types';
import { LocationCard } from "@/components/location-card";

interface LocationListClientProps {
    locations: (Location & { brandSlug: string })[];
}

export function LocationListClient({ locations }: LocationListClientProps) {
    return (
        <div className="space-y-8">
            <div>
            <h1 className="text-3xl font-bold text-center sm:text-left">
                Choose restaurant
            </h1>
            <p className="text-lg text-muted-foreground text-center sm:text-left">
                Next you choose food and drinks that you can order for pick-up or delivery.
            </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {locations.map((location) => (
                <LocationCard key={location.id} location={location} />
            ))}
            </div>
      </div>
    );
}
