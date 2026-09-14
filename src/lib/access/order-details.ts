import 'server-only';
import type { OrderDetail } from '@/types';
import { getOrderById } from '@/app/checkout/order-actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { requireOrderflyAccess } from './orderfly-session';

export async function getOrderDetails(orderId: string): Promise<(OrderDetail & { brandLogoUrl?: string | null }) | null> {
	const order = await getOrderById(orderId);
	if (!order) {
		return null;
	}
	await requireOrderflyAccess(order.brandId,order.locationId?[order.locationId]:null,'orderfly.orders:view');
	const brand = await getBrandById(order.brandId);

	return {
		...order,
		brandLogoUrl: brand?.logoUrl
	} as OrderDetail & { brandLogoUrl?: string | null };
}
