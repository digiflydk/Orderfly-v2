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
                Vælg restaurant
            </h1>
            <p className="text-lg text-muted-foreground text-center sm:text-left">
                Derefter vælger du mad og drikke, som du kan bestille til afhentning eller levering.
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
