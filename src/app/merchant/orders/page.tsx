import { getOrders } from '@/lib/superadmin/getOrders';
import { orderflySession } from '@/lib/access/orderfly-session';
import type { OrderDetail } from '@/types';
import { MerchantOrders } from './merchant-orders';
export const dynamic = 'force-dynamic';
export default async function MerchantOrdersPage() {
  const [orders, access] = await Promise.all([getOrders(), orderflySession()]);
  const rows = orders.map(order => ({ id: order.id, customerName: order.customerName, locationName: order.locationName,
    createdAt: order.createdAt.toISOString(), totalAmount: order.totalAmount, status: order.status,
    paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod || 'Stripe',
    ...((order as OrderDetail).paymentCollection ? { paymentCollection: (order as OrderDetail).paymentCollection } : {}),
  }));
  return <MerchantOrders orders={rows} canEdit={access.superuser || access.permissions.includes('orderfly.orders:edit')} />;
}
