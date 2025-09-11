
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { OrderDetail } from '@/types';
import { ArrowLeft, CreditCard, Download, Hash, Link as LinkIcon, Mail, MapPin, Phone, ShoppingCart, Truck, User, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { sendFeedbackRequestEmail } from '@/app/superadmin/feedback/actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getOrderById } from '@/app/checkout/order-actions';

export const revalidate = 0; // Force dynamic rendering

export async function getOrderDetails(orderId: string): Promise<(OrderDetail & { brandLogoUrl?: string | null }) | null> {
    const order = await getOrderById(orderId);
    if (!order) {
        return null;
    }
    const brand = await getBrandById(order.brandId);

    return {
        ...order,
        brandLogoUrl: brand?.logoUrl
    } as OrderDetail & { brandLogoUrl?: string | null };
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

export default async function OrderDetailPage({ params }: { params: { orderId: string } }) {
    const order = await getOrderDetails(params.orderId);

    if (!order) {
        notFound();
    }

    const sendFeedbackEmailWithId = sendFeedbackRequestEmail.bind(null, order.id);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                     <Button variant="outline" size="sm" asChild>
                        <Link href="/superadmin/sales/orders">
                            <ArrowLeft className="mr-2" />
                            Back to Orders
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        Order <span className="font-mono text-xl bg-muted px-2 py-1 rounded-md">{order.id}</span>
                    </h1>
                    <p className="text-muted-foreground">
                        {order.createdAt ? format(new Date(order.createdAt), 'MMMM d, yyyy HH:mm') : 'Date not available'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                     <form action={sendFeedbackEmailWithId}>
                        <Button variant="outline" type="submit"><MessageSquare className="mr-2"/>Send Feedback Request</Button>
                     </form>
                     <Button variant="outline"><Download className="mr-2"/>Export</Button>
                     <Button asChild><Link href="#" target="_blank"><LinkIcon className="mr-2"/>View in Stripe</Link></Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Order Summary</CardTitle></CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Quantity</TableHead>
                                        <TableHead>Unit Price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {order.productItems.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <p className="font-medium">{item.name}</p>
                                                {item.toppings && item.toppings.length > 0 && <p className="text-xs text-muted-foreground">{item.toppings.join(', ')}</p>}
                                            </TableCell>
                                            <TableCell>{item.quantity}</TableCell>
                                            <TableCell>kr. {item.unitPrice.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">kr. {item.totalPrice.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                                        <TableCell className="text-right">kr. {order.paymentDetails.subtotal.toFixed(2)}</TableCell>
                                    </TableRow>
                                     {order.paymentDetails.discountTotal > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right font-medium text-green-600">Discount</TableCell>
                                            <TableCell className="text-right text-green-600">- kr. {order.paymentDetails.discountTotal.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-medium">Delivery Fee</TableCell>
                                        <TableCell className="text-right">kr. {(order.paymentDetails.deliveryFee ?? 0).toFixed(2)}</TableCell>
                                    </TableRow>
                                     {(order.paymentDetails.bagFee ?? 0) > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right font-medium">Bag Fee</TableCell>
                                            <TableCell className="text-right">kr. {order.paymentDetails.bagFee!.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )}
                                    {(order.paymentDetails.adminFee ?? 0) > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right font-medium">Admin Fee</TableCell>
                                            <TableCell className="text-right">kr. {order.paymentDetails.adminFee!.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )}
                                    <TableRow className="font-bold text-lg">
                                        <TableCell colSpan={3} className="text-right">Total Amount</TableCell>
                                        <TableCell className="text-right">kr. {order.totalAmount.toFixed(2)}</TableCell>
                                    </TableRow>
                                    {(order.paymentDetails.vatAmount ?? 0) > 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-right text-sm text-muted-foreground">Heraf moms</TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">kr. {order.paymentDetails.vatAmount!.toFixed(2)}</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <InfoItem icon={Hash} label="Order Status"><Badge variant={statusVariantMap[order.status]}>{order.status}</Badge></InfoItem>
                            <InfoItem icon={order.deliveryType === 'Delivery' ? Truck : ShoppingCart} label="Order Type">{order.deliveryType}</InfoItem>
                            <InfoItem icon={MapPin} label="Location">{order.brandName} - {order.locationName}</InfoItem>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Customer</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <InfoItem icon={User} label="Name">
                                <Link href={`/superadmin/customers/${order.customerDetails.id}`} className="text-primary hover:underline">{order.customerName}</Link>
                            </InfoItem>
                            <InfoItem icon={Mail} label="Email">{order.customerContact}</InfoItem>
                            <InfoItem icon={MapPin} label="Delivery Address">{order.customerDetails.address}</InfoItem>
                        </CardContent>
                    </Card>
                    
                    <Card>
                        <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <InfoItem icon={CreditCard} label="Payment Status"><Badge variant={statusVariantMap[order.paymentStatus]}>{order.paymentStatus}</Badge></InfoItem>
                            <InfoItem icon={CreditCard} label="Payment Method">{order.paymentMethod}</InfoItem>
                            <InfoItem icon={Hash} label="Payment Reference">
                                <p className="font-mono text-xs break-all">{order.psp?.paymentIntentId || order.psp?.checkoutSessionId}</p>
                            </InfoItem>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
