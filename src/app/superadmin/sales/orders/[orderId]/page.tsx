import { getOrderDetails } from '@/lib/access/order-details';
import { FeedbackRequestButton } from '@/components/superadmin/feedback-request-button';
import { OrderPaymentActions } from '@/components/superadmin/order-payment-actions';
import { paymentMethodLabel } from '@/lib/merchant-payment-methods';
import { orderflySession } from '@/lib/access/orderfly-session';


import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OrderDetail } from '@/types';
import { ArrowLeft, CreditCard, Hash, Link as LinkIcon, Mail, MapPin, Phone, ShoppingCart, Truck, User, MessageSquare } from 'lucide-react';
import Link from '@/components/superadmin/admin-link';
import { formatPrice } from '@/lib/storefront-format';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const revalidate = 0; // Force dynamic rendering

const PAYMENT_STATUS_LABELS: Record<string, string> = { Paid: 'Betalt', Pending: 'Afventer', Failed: 'Mislykket', Refunded: 'Refunderet' };
const DELIVERY_TYPE_LABELS: Record<string, string> = { Delivery: 'Levering', Pickup: 'Afhentning' };
const danishTime = (value: string | number | Date) => new Date(value).toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Copenhagen' });
// Checkout session ids carry the Stripe mode; the dashboard keeps test and live payments apart.
function stripeDashboardUrl(psp?: OrderDetail['psp']) {
	if (!psp?.paymentIntentId) return null;
	const test = psp.checkoutSessionId?.startsWith('cs_test_') ? 'test/' : '';
	return `https://dashboard.stripe.com/${test}payments/${encodeURIComponent(psp.paymentIntentId)}`;
}


const statusVariantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
	'Completed': 'default',
	'Delivered': 'default',
	'Ready': 'default',
	'Paid': 'default',
	'In Progress': 'secondary',
	'Received': 'secondary',
	'Pending': 'secondary',
	'Canceled': 'destructive',
	'Error': 'destructive',
	'Failed': 'destructive',
};

function InfoItem({ icon: Icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) {
	return (
		<div className="flex items-start">
			<Icon className="w-4 h-4 mr-3 mt-1 text-muted-foreground" />
			<div className="flex-1">
				<p className="text-sm text-muted-foreground">{label}</p>
				<div className="font-medium">{children}</div>
			</div>
		</div>
	)
}

type OrderDetailPageProps = {
	params: Promise<{
		orderId: string;
	}>;
};

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
	const { orderId } = await params;
	const order = await getOrderDetails(orderId);
	const access = await orderflySession();
	if (!order) {
		notFound();
	}
	const stripeUrl = stripeDashboardUrl(order.psp);


	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
				<div>
					<Button variant="outline" size="sm" asChild>
						<Link href="/superadmin/sales/orders">
							<ArrowLeft className="mr-2" />
							Tilbage til ordrer
						</Link>
					</Button>
					<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
						Ordre <span className="font-mono text-xl bg-muted px-2 py-1 rounded-md">{order.id}</span>
					</h1>
					<p className="text-muted-foreground">
						{order.paidAt ? `Betalt ${danishTime(order.paidAt)}` : 'Ikke betalt endnu'}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}/receipt`}>Vis kvittering</Link></Button>
                    <Button variant="outline" asChild><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}/kitchen-receipt`}>Vis køkkenbon</Link></Button>
                    <FeedbackRequestButton orderId={order.id} />
					{stripeUrl && <Button asChild><a href={stripeUrl} target="_blank" rel="noopener noreferrer"><LinkIcon className="mr-2" />Se i Stripe</a></Button>}
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-6">
					<Card>
						<CardHeader><CardTitle>Ordreoversigt</CardTitle></CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Vare</TableHead>
										<TableHead>Antal</TableHead>
										<TableHead>Stykpris</TableHead>
										<TableHead className="text-right">I alt</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{order.productItems.map((item, index) => (
										<TableRow key={index}>
											<TableCell>
												<p className="font-medium">{item.name}</p>
												{item.toppings && item.toppings.length > 0 && <p className="text-xs text-muted-foreground">{item.toppings.join(', ')}</p>}
                                                {item.comboSelections?.map(group => <p key={group.groupId || group.groupName} className="text-xs text-muted-foreground">{group.groupName}: {group.products.map(product => product.name).join(', ')}</p>)}
											</TableCell>
											<TableCell>{item.quantity}</TableCell>
											<TableCell>{formatPrice(item.unitPrice ?? 0)}</TableCell>
											<TableCell className="text-right">{formatPrice(item.totalPrice)}</TableCell>
										</TableRow>
									))}
									<TableRow>
										<TableCell colSpan={3} className="text-right font-medium">Varesubtotal</TableCell>
										<TableCell className="text-right">{formatPrice(order.paymentDetails.subtotal)}</TableCell>
									</TableRow>
									{order.paymentDetails.discountTotal > 0 && (
										<TableRow>
											<TableCell colSpan={3} className="text-right font-medium text-green-600">Rabat</TableCell>
											<TableCell className="text-right text-green-600">−{formatPrice(order.paymentDetails.discountTotal)}</TableCell>
										</TableRow>
									)}
									<TableRow>
										<TableCell colSpan={3} className="text-right font-medium">Levering</TableCell>
										<TableCell className="text-right">{formatPrice(order.paymentDetails.deliveryFee ?? 0)}</TableCell>
									</TableRow>
									{(order.paymentDetails.bagFee ?? 0) > 0 && (
										<TableRow>
											<TableCell colSpan={3} className="text-right font-medium">Pose</TableCell>
											<TableCell className="text-right">{formatPrice(order.paymentDetails.bagFee!)}</TableCell>
										</TableRow>
									)}
									{(order.paymentDetails.adminFee ?? 0) > 0 && (
										<TableRow>
											<TableCell colSpan={3} className="text-right font-medium">Administrationsgebyr</TableCell>
											<TableCell className="text-right">{formatPrice(order.paymentDetails.adminFee!)}</TableCell>
										</TableRow>
									)}
									<TableRow className="font-bold text-lg">
										<TableCell colSpan={3} className="text-right">I alt</TableCell>
										<TableCell className="text-right">{formatPrice(order.totalAmount)}</TableCell>
									</TableRow>
									{(order.paymentDetails.vatAmount ?? 0) > 0 && (
										<TableRow>
											<TableCell colSpan={3} className="text-right text-sm text-muted-foreground">Heraf moms</TableCell>
											<TableCell className="text-right text-sm text-muted-foreground">{formatPrice(order.paymentDetails.vatAmount!)}</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				</div>

				<div className="space-y-6">
					<Card>
						<CardHeader><CardTitle>Ordredetaljer</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<InfoItem icon={Hash} label="Ordrestatus"><Badge variant={statusVariantMap[order.status]}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge></InfoItem>
							{order.status === 'Canceled' && order.cancellationComment && <InfoItem icon={MessageSquare} label="Begrundelse for annullering"><p className="whitespace-pre-wrap">{order.cancellationComment}</p></InfoItem>}
							<InfoItem icon={order.deliveryType === 'Delivery' ? Truck : ShoppingCart} label="Ordretype">{DELIVERY_TYPE_LABELS[order.deliveryType] ?? order.deliveryType}</InfoItem>
							<InfoItem icon={MapPin} label="Restaurant">{order.brandName} - {order.locationName}</InfoItem>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Kunde</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<InfoItem icon={User} label="Navn">
								<Link href={`/superadmin/customers/${order.customerDetails.id}`} className="text-primary hover:underline">{order.customerName}</Link>
							</InfoItem>
							<InfoItem icon={Mail} label="E-mail">{order.customerContact}</InfoItem>
							<InfoItem icon={MapPin} label="Leveringsadresse">{order.customerDetails.address}</InfoItem>
						</CardContent>
					</Card>

					<Card>
						<CardHeader><CardTitle>Betaling</CardTitle></CardHeader>
						<CardContent className="space-y-4">
							<InfoItem icon={CreditCard} label="Betalingsstatus"><Badge variant={statusVariantMap[order.paymentStatus]}>{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</Badge></InfoItem>
							<InfoItem icon={CreditCard} label="Betalingsmetode">{paymentMethodLabel(order)}</InfoItem>
							{order.paymentCollection && <p>Betaling modtaget {danishTime(order.paymentCollection.receivedAt)} af {order.paymentCollection.employeeName || order.paymentCollection.employeeId}.</p>}
							<OrderPaymentActions orderId={order.id} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} status={order.status} canEdit={access.superuser || access.permissions.includes('orderfly.orders:edit')} />
							<InfoItem icon={Hash} label="Betalingsreference">
								<p className="font-mono text-xs break-all">{order.psp?.paymentIntentId || order.psp?.checkoutSessionId}</p>
							</InfoItem>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
