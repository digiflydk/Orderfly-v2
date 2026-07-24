import type { AsyncPageProps } from '@/types/next-async-props';
import { resolveSearchParams } from '@/lib/next/resolve-props';
import { getOrders } from '@/lib/superadmin/getOrders';
import {
  OrdersClientPage,
  type ClientOrderSummary,
} from '@/components/superadmin/sales/orders-client-page';
import type { OrderSummary } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DateLike =
  | Date
  | string
  | number
  | null
  | undefined
  | {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };

function serializeDate(value: DateLike): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : value.toISOString();
  }

  if (
    typeof value === 'object' &&
    typeof value.toDate === 'function'
  ) {
    const convertedDate = value.toDate();

    return Number.isNaN(convertedDate.getTime())
      ? undefined
      : convertedDate.toISOString();
  }

  if (
    typeof value === 'object' &&
    typeof value.seconds === 'number'
  ) {
    const convertedDate = new Date(value.seconds * 1000);

    return Number.isNaN(convertedDate.getTime())
      ? undefined
      : convertedDate.toISOString();
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    const convertedDate = new Date(value);

    return Number.isNaN(convertedDate.getTime())
      ? undefined
      : convertedDate.toISOString();
  }

  return undefined;
}

export default async function OrdersPage({
  searchParams,
}: AsyncPageProps) {
  try {
    const query = await resolveSearchParams<Record<string, string | string[] | undefined>>(
      searchParams,
    );

    const dateFrom = typeof query.from === 'string' ? query.from : undefined;
    const dateTo = typeof query.to === 'string' ? query.to : undefined;

    const filters: Partial<SACommonFilters> = {
      ...(dateFrom && dateTo ? { dateFrom, dateTo } : {}),
    };

    const orders: OrderSummary[] = await getOrders(filters);

    const serializedOrders: ClientOrderSummary[] = orders.map((order) => ({
      id: String(order.id),
      total:
        typeof order.totalAmount === 'number'
          ? order.totalAmount
          : Number(order.totalAmount ?? 0),
      createdAt: serializeDate(order.createdAt as DateLike),
    }));

    return (
      <OrdersClientPage
        data={serializedOrders}
        initialFrom={dateFrom}
        initialTo={dateTo}
      />
    );
  } catch (error) {
    console.error(
      '[OrdersPage] Failed to load orders:',
      error,
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error while loading orders.';

    return (
      <div className="space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">
            Sales &amp; Orders
          </h1>

          <p className="text-muted-foreground">
            The order page could not be loaded.
          </p>
        </div>

        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">
            Failed to load orders
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessage}
          </p>
        </div>
      </div>
    );
  }
}
