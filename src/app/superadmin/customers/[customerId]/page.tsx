

import { notFound, redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Customer, OrderDetail } from '@/types';
import { ArrowLeft, Check, CheckCircle, Cookie, Download, Edit, Eye, FileText, Home, Link as LinkIcon, Mail, Phone, Repeat, ShoppingBag, Star, Truck, User, UserX, XCircle } from 'lucide-react';
import LinkNext from 'next/link';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getCustomerDetails } from '../actions';
import { ScrollArea } from '@/components/ui/scroll-area';


function KpiCard({ title, value, icon: Icon }: { title: string; value: string | number, icon: React.ElementType }) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    )
}

const loyaltyVariantMap: Record<string, 'default' | 'secondary' | 'destructive'> = {
    'Loyal': 'default',
    'Occasional': 'secondary',
    'At Risk': 'destructive'
};

const RatingStars = ({ rating }: { rating: number }) => (
    <div className="flex items-center">
      {[...Array(5)].map((_, i) => (
        <Star key={i} className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
      ))}
    </div>
  );

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
    const { customerId } = await params;
    
    if (!customerId) {
        return notFound();
    }
    
    const details = await getCustomerDetails(customerId);

    if (!details) {
        notFound();
    }
    
    const { customer, allOrders, deliveryOrdersCount, pickupOrdersCount, retentionRate, loyaltyScore, loyaltyClassification, averageFeedbackRating, orderIdsWithFeedback, feedbackEntries } = details;

    const fullAddress = customer.street ? `${customer.street}, ${customer.zipCode} ${customer.city}, ${customer.country}` : 'No address on file';

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <Button variant="outline" size="sm" asChild className="mb-2">
                        <LinkNext href="/superadmin/customers">
                            <ArrowLeft className="mr-2" />
                            Back to Customers
                        </LinkNext>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        {customer.fullName}
                         <Badge variant={loyaltyVariantMap[loyaltyClassification] ?? 'secondary'}>
                            {loyaltyClassification}
                        </Badge>
                    </h1>
                    <p className="text-muted-foreground">
                       Customer since {format(new Date(customer.createdAt), 'MMM d, yyyy')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                     <Button variant="outline"><Download className="mr-2"/>Export</Button>
                     <Button variant="destructive"><UserX className="mr-2"/>Anonymize</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard title="Total Orders" value={customer.totalOrders} icon={FileText} />
                        <KpiCard title="Total Spend" value={`kr.${customer.totalSpend.toFixed(2)}`} icon={FileText} />
                        <KpiCard title="Loyalty Score" value={`${loyaltyScore}/100`} icon={Star} />
                        <KpiCard title="Avg. Rating" value={averageFeedbackRating > 0 ? `${averageFeedbackRating.toFixed(1)}/5` : 'N/A'} icon={Star} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Order History</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <ScrollArea className="h-96">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Order ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Feedback</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allOrders.map(order => (
                                            <TableRow key={order.id}>
                                                <TableCell className="font-mono text-xs">
                                                    <LinkNext href={`/superadmin/sales/orders/${order.id}`} className="text-primary hover:underline">
                                                    {order.id}
                                                    </LinkNext>
                                                </TableCell>
                                                <TableCell>{format(new Date(order.createdAt), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>
                                                    <Badge>{order.status}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {orderIdsWithFeedback.includes(order.id) && (
                                                        <Badge variant="secondary"><Check className="mr-1 h-3 w-3" />Submitted</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">kr.{order.totalAmount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                        {allOrders.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No orders found.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                             </ScrollArea>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader>
                            <CardTitle>Feedback History</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <ScrollArea className="h-72">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Feedback ID</TableHead>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Rating</TableHead>
                                            <TableHead>Comment</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {feedbackEntries.map(feedback => (
                                            <TableRow key={feedback.id}>
                                                <TableCell className="font-mono text-xs">{feedback.id.substring(0, 6).toUpperCase()}</TableCell>
                                                <TableCell>{format(new Date(feedback.receivedAt), 'MMM d, yyyy')}</TableCell>
                                                <TableCell><RatingStars rating={feedback.rating} /></TableCell>
                                                <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{feedback.comment || '-'}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="sm" asChild>
                                                        <LinkNext href={`/superadmin/feedback/${feedback.id}`}>View</LinkNext>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {feedbackEntries.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground h-24">No feedback submitted.</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                             </ScrollArea>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                     <Card>
                        <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <div className="flex items-center gap-2">
                                <Badge variant={customer.status === 'active' ? 'default' : 'secondary'} className="w-fit">{customer.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <a href={`mailto:${customer.email}`} className="text-primary hover:underline">{customer.email}</a>
                            </div>
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <a href={`tel:${customer.phone}`} className="text-primary hover:underline">{customer.phone}</a>
                            </div>
                            <Separator />
                            <div className="flex items-start gap-2">
                                <Home className="h-4 w-4 text-muted-foreground mt-1" />
                                <span>{fullAddress}</span>
                            </div>
                             <div className="flex items-start gap-2">
                                {customer.marketingConsent ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                                ) : (
                                    <XCircle className="h-4 w-4 text-muted-foreground mt-1" />
                                )}
                                <span>Marketing Consent</span>
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><CardTitle>Order Statistics</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-sm">
                           <div className="flex justify-between"><span>Delivery Orders</span><span className="font-medium">{deliveryOrdersCount}</span></div>
                           <div className="flex justify-between"><span>Pickup Orders</span><span className="font-medium">{pickupOrdersCount}</span></div>
                           <div className="flex justify-between"><span>Retention Rate</span><span className="font-medium">{retentionRate}%</span></div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Cookie Consent</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            {customer.cookie_consent ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span>Givet:</span>
                                        <Badge><Check className="mr-1 h-3 w-3"/>Ja</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Version:</span>
                                        <span className="font-medium">{customer.cookie_consent.consent_version}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Sidst opdateret:</span>
                                        <span className="font-medium">{format(new Date(customer.cookie_consent.timestamp), 'MMM d, yyyy HH:mm')}</span>
                                    </div>
                                    <Separator />
                                     <div className="flex items-center justify-between">
                                        <span>Marketing:</span>
                                        <Badge variant={customer.cookie_consent.marketing ? 'default' : 'secondary'}>{customer.cookie_consent.marketing ? 'Ja' : 'Nej'}</Badge>
                                    </div>
                                     <div className="flex items-center justify-between">
                                        <span>Statistik:</span>
                                        <Badge variant={customer.cookie_consent.statistics ? 'default' : 'secondary'}>{customer.cookie_consent.statistics ? 'Ja' : 'Nej'}</Badge>
                                    </div>
                                     <div className="flex items-center justify-between">
                                        <span>Funktionelle:</span>
                                        <Badge variant={customer.cookie_consent.functional ? 'default' : 'secondary'}>{customer.cookie_consent.functional ? 'Ja' : 'Nej'}</Badge>
                                    </div>
                                    <Separator />
                                    {customer.cookie_consent.origin_brand && (
                                        <div className="flex items-center justify-between">
                                            <span>Oprindelig brand:</span>
                                            <span className="font-medium">{customer.cookie_consent.origin_brand}</span>
                                        </div>
                                    )}
                                    {customer.cookie_consent.linked_anon_id && (
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-1"><LinkIcon className="h-4 w-4 text-muted-foreground"/>Linket ID:</span>
                                            <span className="font-mono text-xs">{customer.cookie_consent.linked_anon_id.substring(0,8)}...</span>
                                        </div>
                                    )}

                                </>
                            ) : (
                                <div className="text-center text-muted-foreground">
                                    <Cookie className="mx-auto h-8 w-8 mb-2"/>
                                    <p>Intet cookie-samtykke registreret for denne kunde.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

            </div>
        </div>
    );
}
