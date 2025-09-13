

'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Brand, Location } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';

import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { toQuery } from '@/lib/utils/url';


type Props = {
  value: SACommonFilters;
  brands: {id:string;name:string}[];
  locations: {id:string;name:string;brandId:string}[];
  hideBrand?: boolean;
  hideLocations?: boolean;
  onFilterChange: (newFilters: SACommonFilters) => void;
};

export function FiltersBar({ value, brands, locations, hideBrand = false, hideLocations = false, onFilterChange }: Props) {
  const [filters, setFilters] = useState<SACommonFilters>(value);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const pathname = usePathname();

  const availableLocations = useMemo(() => {
    if (hideLocations || !filters.brandId || filters.brandId === 'all') {
      return locations;
    }
    return locations.filter(l => l.brandId === filters.brandId);
  }, [locations, filters.brandId, hideLocations]);

  const handleLocalFilterChange = (key: keyof SACommonFilters, val: any) => {
    const newFilters = { ...filters, [key]: val };
    
    if (key === 'brandId') {
      newFilters.locationIds = [];
    }
    setFilters(newFilters);
  };
  
  const handleDateChange = (range: DateRange | undefined) => {
    const today = new Date().toISOString().slice(0,10);
    const newFilters = {
        ...filters,
        dateFrom: range?.from ? range.from.toISOString().slice(0,10) : today,
        dateTo: range?.to ? range.to.toISOString().slice(0,10) : today
    };
    setFilters(newFilters);
  }

  const applyFilters = () => {
    startTransition(() => {
        onFilterChange(filters);
    })
  }

  return (
    <Card>
      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <DateRangePicker 
            onRangeChange={handleDateChange} 
            initialDateFrom={filters.dateFrom} 
            initialDateTo={filters.dateTo} 
        />
        {!hideBrand && (
            <Select onValueChange={(v) => handleLocalFilterChange('brandId', v)} value={filters.brandId || 'all'}>
                <SelectTrigger><SelectValue placeholder="All Brands" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Brands</SelectItem>{brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
        )}
        {!hideLocations && (
            <MultiSelect
                options={availableLocations.map(l => ({ value: l.id, label: l.name }))}
                selected={filters.locationIds || []}
                onChange={(selected) => handleLocalFilterChange('locationIds', selected)}
                placeholder="All Locations"
                className="w-full"
            />
        )}
         <Button onClick={applyFilters} className="w-full lg:w-auto" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Filter
        </Button>
      </CardContent>
    </Card>
  );
}
