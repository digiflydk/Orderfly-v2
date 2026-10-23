'use client';

import * as React from 'react';
import Link from '@/components/superadmin/admin-link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Search,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { paymentMethodLabel } from '@/lib/merchant-payment-methods';
import { sumNetPaidSales } from '@/lib/paid-order';
import { canceledPickupPaymentLabel, formatPaidAt, ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { AdminDateRange } from '@/components/superadmin/admin-date-range';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export type ClientOrderSummary = {
  id: string;
  total: number;
  paidAt?: string;
  netTotal?: number;
  refundedAmountOre?: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  paymentCollection?: { method: 'cash' | 'card' };
  paidSale: boolean;
};

interface OrdersClientPageProps {
  data?: ClientOrderSummary[];
  initialFrom?: string;
  initialTo?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK',
  }).format(Number.isFinite(value) ? value : 0);
}

export function OrdersClientPage({
  data = [],
  initialFrom = '',
  initialTo = '',
}: OrdersClientPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState(initialFrom);
  const [dateTo, setDateTo] = React.useState(initialTo);
  const [dateError, setDateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDateFrom(initialFrom);
    setDateTo(initialTo);
  }, [initialFrom, initialTo]);

  const filteredOrders = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return data;
    }

    return data.filter(order =>
      order.id.toLowerCase().includes(normalizedSearch),
    );
  }, [data, search]);

  const totalRevenue = React.useMemo(() => sumNetPaidSales(data), [data]);

  const latestOrder = data[0];

  function applyDateFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      setDateError('Vælg både en fra-dato og en til-dato.');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('Fra-datoen kan ikke ligge efter til-datoen.');
      return;
    }

    setDateError(null);

    const params = new URLSearchParams(searchParams.toString());

    if (dateFrom && dateTo) {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    } else {
      params.delete('from');
      params.delete('to');
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  function clearDateFilter() {
    setDateFrom('');
    setDateTo('');
    setDateError(null);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('from');
    params.delete('to');

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Salg og ordrer
          </h1>

          <p className="text-muted-foreground">
            Se og administrér alle ordrer.
          </p>
        </div>
      </div>

      <form onSubmit={applyDateFilter}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <AdminDateRange className="flex-1" from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} fromLabel="Betalt fra" toLabel="Betalt til" groupLabel="Betalingsperiode" />

              <div className="flex gap-2">
                <Button type="submit">Anvend</Button>
                <Button type="button" variant="outline" onClick={clearDateFilter}>
                  Nulstil
                </Button>
              </div>
            </div>

            {dateError ? (
              <p className="mt-3 text-sm text-destructive">{dateError}</p>
            ) : null}
          </CardContent>
        </Card>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Betalte ordrer
            </CardTitle>

            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {data.filter(order => order.paidSale).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Betalt omsætning
            </CardTitle>

            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalRevenue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Seneste betaling
            </CardTitle>

            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-sm font-medium">
              {latestOrder
                ? formatPaidAt(latestOrder.paidAt, latestOrder.paymentStatus)
                : 'Ingen ordrer endnu'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Ordrer</CardTitle>

              <p className="mt-1 text-sm text-muted-foreground">
                {filteredOrders.length} {filteredOrders.length === 1 ? 'ordre' : 'ordrer'}
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                placeholder="Søg på ordre-id"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center">
              <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />

              <h2 className="font-semibold">
                Ingen ordrer fundet
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {data.length === 0
                  ? dateFrom && dateTo
                    ? 'Der er ingen ordrer i den valgte periode.'
                    : 'Der er endnu ingen ordrer.'
                  : 'Ingen ordrer matcher din søgning.'}
              </p>
            </div>
          ) : (
            <div className="admin-data-panel overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">
                      Ordre-id
                    </TableHead>

                    <TableHead scope="col">
                      Betalt
                    </TableHead>

                    <TableHead scope="col">
                      Status
                    </TableHead>

                    <TableHead scope="col" className="text-right">
                      I alt
                    </TableHead>

                    <TableHead scope="col" className="text-right">
                      Handlinger
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredOrders.map(order => (
                    <TableRow
                      key={order.id}
                    >
                      <TableCell className="font-medium">
                        {order.id}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {formatPaidAt(order.paidAt, order.paymentStatus)}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary">
                          {order.status === 'Canceled' && order.paymentMethod === 'PayAtPickup' ? 'Annulleret' : order.paymentStatus === 'Paid' || order.paymentMethod === 'PayAtPickup' && order.paymentStatus === 'Pending' && order.status !== 'Pending' ? ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status : order.paymentStatus === 'Failed' ? 'Betaling afbrudt' : 'Afventer betaling'}
                        </Badge>
                        <p className="mt-1 text-sm">{canceledPickupPaymentLabel(order) ?? paymentMethodLabel(order)}</p>
                      </TableCell>

                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.netTotal ?? (order.paidSale ? order.total : 0))}
                        {(order.refundedAmountOre ?? 0) > 0 && <p className="text-xs font-normal text-muted-foreground">Refund: −{formatCurrency((order.refundedAmountOre ?? 0) / 100)}</p>}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm" className="mr-2"><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}/receipt`}>Vis kvittering</Link></Button>
                    <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}/kitchen-receipt`}>Vis køkkenbon</Link></Button>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                        >
                          <Link
                            href={`/superadmin/sales/orders/${encodeURIComponent(
                              order.id,
                            )}`}
                          >
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default OrdersClientPage;
