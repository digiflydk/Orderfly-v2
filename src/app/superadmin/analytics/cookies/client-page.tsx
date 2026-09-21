

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, CheckCircle, XCircle } from "lucide-react";
import type { AnonymousCookieConsent, Brand } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatInTimeZone } from 'date-fns-tz';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { getAnonymousCookieConsents } from './actions';
import { COOKIE_REPORT_TIMEZONE, cookieReportDay } from '@/lib/analytics/cookie-consent-dates';
import { PendingFeedback } from '@/components/superadmin/pending-feedback';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ConsentWithDetails = AnonymousCookieConsent & { brandName: string };

interface CookiesClientPageProps {
    initialConsents: ConsentWithDetails[];
    brands: Brand[];
    initialDateFrom?: string;
    initialDateTo?: string;
}

const BooleanIcon = ({ value }: { value: boolean }) => {
    return <span role="img" aria-label={value === true ? 'Ja' : 'Nej'}>{value === true ? <CheckCircle aria-hidden="true" className="h-5 w-5 text-green-500" /> : <XCircle aria-hidden="true" className="h-5 w-5 text-muted-foreground" />}</span>;
};

export function CookiesClientPage({ initialConsents, brands, initialDateFrom, initialDateTo }: CookiesClientPageProps) {
  const [consents, setConsents] = useState(initialConsents);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current++; }, []);
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: parseISO(initialDateFrom || cookieReportDay()),
    to: parseISO(initialDateTo || initialDateFrom || cookieReportDay()),
  }));
  const [loadedRange, setLoadedRange] = useState(dateRange);

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    brandId: 'all',
    linked: 'all',
    marketing: 'all',
  });

  const loadRange = async (range: DateRange) => {
    if (!range.from) return;
    const currentRequest = ++requestId.current;
    setIsPending(true);
    setError(null);
    try {
      // Send calendar dates, not browser-local midnight instants.
      const fetchedConsents = await getAnonymousCookieConsents(
        format(range.from, 'yyyy-MM-dd'), format(range.to || range.from, 'yyyy-MM-dd'),
      );
      if (currentRequest !== requestId.current) return;
      const brandMap = new Map(brands.map(b => [b.id, b.name]));
      setConsents(fetchedConsents.map(consent => ({
        ...consent, brandName: brandMap.get(consent.brand_id) || 'Unknown Brand',
      })));
      setLoadedRange(range);
    } catch {
      if (currentRequest === requestId.current) {
        setError('Samtykkerne kunne ikke indlæses. De senest indlæste data vises stadig. Prøv igen.');
      }
    } finally {
      if (currentRequest === requestId.current) setIsPending(false);
    }
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    const next = range?.from ? range : { from: parseISO(cookieReportDay()), to: parseISO(cookieReportDay()) };
    setDateRange(next);
    void loadRange(next);
  };


  const filteredConsents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return consents.filter(consent => {
      const searchMatch = !query || [consent.id, consent.anon_user_id].some(id => id?.toLowerCase().includes(query));
      const brandMatch = filters.brandId === 'all' || consent.brand_id === filters.brandId;
      const linkedMatch = filters.linked === 'all' || String(consent.linked_to_customer === true) === filters.linked;
      const marketingMatch = filters.marketing === 'all' || String(consent.marketing === true) === filters.marketing;
      
      return searchMatch && brandMatch && linkedMatch && marketingMatch;
    });
  }, [consents, searchQuery, filters]);

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilters({ brandId: 'all', linked: 'all', marketing: 'all' });
    const today = parseISO(cookieReportDay());
    handleDateRangeChange({ from: today, to: today });
  };

  const today = cookieReportDay();
  const isFiltered = searchQuery !== '' || Object.values(filters).some(v => v !== 'all') ||
    (dateRange.from && (format(dateRange.from, 'yyyy-MM-dd') !== today || format(dateRange.to || dateRange.from, 'yyyy-MM-dd') !== today));

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return 'N/A';
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      return formatInTimeZone(date, COOKIE_REPORT_TIMEZONE, 'dd.MM.yyyy HH:mm');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="space-y-4">
      {isPending && <PendingFeedback label="Indlæser samtykker…" />}
      <Card>
        <CardContent className="p-4 space-y-4">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              placeholder="Search by Anonymous User ID..."
              aria-label="Søg efter anonymt bruger-ID"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lg:col-span-2"
            />
            <Select value={filters.brandId} onValueChange={(v) => handleFilterChange('brandId', v)}>
              <SelectTrigger aria-label="Brand"><SelectValue placeholder="Filter by brand..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.linked} onValueChange={(v) => handleFilterChange('linked', v)}>
              <SelectTrigger aria-label="Kundetilknytning"><SelectValue placeholder="Filter by linked status..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="true">Linked</SelectItem>
                <SelectItem value="false">Not Linked</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.marketing} onValueChange={(v) => handleFilterChange('marketing', v)}>
              <SelectTrigger aria-label="Marketingsamtykke"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle marketingsamtykker</SelectItem>
                <SelectItem value="true">Accepteret</SelectItem>
                <SelectItem value="false">Ikke accepteret</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker value={dateRange} onRangeChange={handleDateRangeChange} />
          </div>
          {isFiltered && (
            <Button variant="ghost" onClick={clearFilters} className="h-8 px-4">
              <X className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button variant="outline" className="mt-2" onClick={() => void loadRange(dateRange)} disabled={isPending}>Prøv igen</Button></Alert>}
      <p className="text-sm text-muted-foreground">
        Viser samtykker sidst opdateret {loadedRange.from && format(loadedRange.from, 'dd.MM.yyyy')} – {loadedRange.from && format(loadedRange.to || loadedRange.from, 'dd.MM.yyyy')} (Europe/Copenhagen).
      </p>
      <Card>
        <CardContent className="pt-6 relative" aria-busy={isPending}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anonymous ID</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Sidst opdateret (DK)</TableHead>
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
                  <TableCell className="font-mono text-xs" title={consent.anon_user_id || consent.id}>{(consent.anon_user_id || consent.id).substring(0, 8)}...</TableCell>
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
