'use client';

import * as React from 'react';
import Link from 'next/link';
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

export type ClientOrderSummary = {
  id: string;
  total: number;
  createdAt?: string;
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

function formatDate(value?: string): string {
  if (!value) {
    return 'Unknown date';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

  const totalRevenue = React.useMemo(
    () =>
      data.reduce(
        (sum, order) =>
          sum +
          (Number.isFinite(order.total)
            ? order.total
            : 0),
        0,
      ),
    [data],
  );

  const latestOrder = data[0];

  function applyDateFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      setDateError('Select both a from date and a to date.');
      return;
    }

    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('The from date cannot be later than the to date.');
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
            Sales &amp; Orders
          </h1>

          <p className="text-muted-foreground">
            View and manage all orders.
          </p>
        </div>
      </div>

      <form onSubmit={applyDateFilter}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="grid flex-1 gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  <span>From date</span>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={event => setDateFrom(event.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm font-medium">
                  <span>To date</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={event => setDateTo(event.target.value)}
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <Button type="submit">Apply</Button>
                <Button type="button" variant="outline" onClick={clearDateFilter}>
                  Clear
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
              Total Orders
            </CardTitle>

            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {data.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
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
              Latest Order
            </CardTitle>

            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>

          <CardContent>
            <div className="text-sm font-medium">
              {latestOrder
                ? formatDate(latestOrder.createdAt)
                : 'No orders yet'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Orders</CardTitle>

              <p className="mt-1 text-sm text-muted-foreground">
                {filteredOrders.length} order
                {filteredOrders.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                placeholder="Search by order ID"
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
                No orders found
              </h2>

              <p className="mt-1 text-sm text-muted-foreground">
                {data.length === 0
                  ? dateFrom && dateTo
                    ? 'No orders were found in the selected date range.'
                    : 'There are currently no orders in the orders collection.'
                  : 'No orders match your search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b text-left">
                    <th className="px-4 py-3 font-medium">
                      Order ID
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Date
                    </th>

                    <th className="px-4 py-3 font-medium">
                      Status
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      Total
                    </th>

                    <th className="px-4 py-3 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrders.map(order => (
                    <tr
                      key={order.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-4 py-3 font-medium">
                        {order.id}
                      </td>

                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          Received
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(order.total)}
                      </td>

                      <td className="px-4 py-3 text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default OrdersClientPage;
