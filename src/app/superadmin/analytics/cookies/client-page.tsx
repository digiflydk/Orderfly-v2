

'use client';

import { useState, useMemo, useTransition } from 'react';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { AnonymousCookieConsent, Brand } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toZonedTime } from 'date-fns-tz';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { getAnonymousCookieConsents } from './actions';

type ConsentWithDetails = AnonymousCookieConsent & { brandName: string };

interface CookiesClientPageProps {
    initialConsents: ConsentWithDetails[];
    brands: Brand[];
}

const BooleanIcon = ({ value }: { value: boolean }) => {
    return value ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />;
};

export function CookiesClientPage({ initialConsents, brands }: CookiesClientPageProps) {
  const [consents, setConsents] = useState(initialConsents);
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    brandId: 'all',
    linked: 'all',
    marketing: 'all',
  });

  const handleDateRangeChange = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
        startTransition(async () => {
            const fetchedConsents = await getAnonymousCookieConsents(range.from, range.to);
             const brandMap = new Map(brands.map(b => [b.id, b.name]));
             const consentsWithDetails = fetchedConsents.map(consent => ({
                ...consent,
                brandName: brandMap.get(consent.brand_id) || 'Unknown Brand',
            }));
            setConsents(consentsWithDetails);
        });
    }
  }


  const filteredConsents = useMemo(() => {
    return consents.filter(consent => {
      const searchMatch = searchQuery === '' || consent.id.toLowerCase().includes(searchQuery.toLowerCase());
      const brandMatch = filters.brandId === 'all' || consent.brand_id === filters.brandId;
      const linkedMatch = filters.linked === 'all' || String(consent.linked_to_customer) === filters.linked;
      const marketingMatch = filters.marketing === 'all' || String(consent.marketing) === filters.marketing;
      
      return searchMatch && brandMatch && linkedMatch && marketingMatch;
    });
  }, [consents, searchQuery, filters]);

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({ brandId: 'all', linked: 'all', marketing: 'all' });
  };

  const isFiltered = searchQuery !== '' || Object.values(filters).some(v => v !== 'all');

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return 'N/A';
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      const zonedDate = toZonedTime(date, 'UTC');
      return format(zonedDate, 'MMM d, yyyy HH:mm');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Search by Anonymous User ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lg:col-span-2"
            />
            <Select value={filters.brandId} onValueChange={(v) => handleFilterChange('brandId', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by brand..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.linked} onValueChange={(v) => handleFilterChange('linked', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by linked status..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="true">Linked</SelectItem>
                <SelectItem value="false">Not Linked</SelectItem>
              </SelectContent>
            </Select>
             <DateRangePicker onRangeChange={handleDateRangeChange} />
          </div>
          {isFiltered && (
            <Button variant="ghost" onClick={clearFilters} className="h-8 px-4">
              <X className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 relative">
          {isPending && <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10"><Loader2 className="animate-spin h-8 w-8" /></div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anonymous ID</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead>Marketing</TableHead>
                <TableHead>Statistics</TableHead>
                <TableHead>Functional</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Linked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConsents.map((consent) => (
                <TableRow key={consent.id}>
                  <TableCell className="font-mono text-xs">{consent.id.substring(0, 8)}...</TableCell>
                  <TableCell>{consent.brandName}</TableCell>
                  <TableCell>{formatDate(consent.last_seen)}</TableCell>
                  <TableCell><BooleanIcon value={consent.marketing} /></TableCell>
                  <TableCell><BooleanIcon value={consent.statistics} /></TableCell>
                  <TableCell><BooleanIcon value={consent.functional} /></TableCell>
                  <TableCell>{consent.consent_version}</TableCell>
                  <TableCell><BooleanIcon value={consent.linked_to_customer} /></TableCell>
                </TableRow>
              ))}
              {filteredConsents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No consents found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
