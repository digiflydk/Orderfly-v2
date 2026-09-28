import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle, Cookie, FileText, Home, Mail, Phone, Star, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { customerDirectory } from '@/lib/customers/directory-server';
import { customerHistory } from '@/lib/customers/history-server';
import { asDate } from '@/lib/loyalty/model';
import { getCustomerDetails } from '../actions';
import { CustomerRecordActions } from './record-actions';
import { CustomerHistory } from './customer-history';

export const dynamic = 'force-dynamic';

function Kpi({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card>;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  if (!customerId) notFound();
  const details = await getCustomerDetails(customerId);
  if (!details) notFound();
  const { customer, deliveryOrdersCount, pickupOrdersCount, retentionRate, loyaltyClassification, loyaltyScore, averageFeedbackRating, feedbackEntries, feedbackAccess, allOrders } = details;
  const { entries } = await customerDirectory();
  const activity = entries.find(entry => entry.sources.some(source => source.kind === 'customer' && source.id === customer.id && source.brandId === customer.brandId));
  const history = await customerHistory(activity, customer, allOrders, feedbackEntries, feedbackAccess);
  const address = customer.street ? `${customer.street}, ${customer.zipCode || ''} ${customer.city || ''}, ${customer.country || ''}` : 'No address on file';
  const since = asDate(customer.createdAt);
  const consentDate = asDate(customer.cookie_consent?.timestamp);
  const totalOrders = activity?.totalOrders ?? customer.totalOrders;
  const totalSpend = activity?.totalSpend ?? customer.totalSpend;

  return <div className="space-y-6">
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div>
      <Button variant="outline" size="sm" asChild className="mb-2"><Link href="/superadmin/customers"><ArrowLeft className="mr-2 h-4 w-4" />Back to Customers</Link></Button>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">{customer.fullName}<Badge variant={loyaltyClassification === 'Loyal' ? 'default' : 'secondary'}>{loyaltyClassification}</Badge></h1>
      <p className="text-muted-foreground">Customer since {since ? format(since, 'MMM d, yyyy') : 'date unknown'}</p>
    </div><CustomerRecordActions customer={{ id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, status: customer.status }} /></div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi title="Paid Purchases" value={totalOrders} icon={FileText} />
      <Kpi title="Total Spend" value={totalSpend.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })} icon={FileText} />
      <Kpi title="Loyalty Score (this record)" value={`${loyaltyScore}/100`} icon={Star} />
      <Kpi title="Avg. Rating (this record)" value={averageFeedbackRating > 0 ? `${averageFeedbackRating.toFixed(1)}/5` : 'N/A'} icon={Star} />
    </div>
    {activity && activity.brandIds.length > 1 && <p className="text-sm text-muted-foreground">Records with the same email are shown together as a possible match. Verify identity before using information across merchants.</p>}

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader><CardTitle>Contact Information</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>{customer.status}</Badge>
        <p className="flex items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /><a href={`mailto:${customer.email}`} className="text-primary hover:underline">{customer.email}</a></p>
        <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${customer.phone}`} className="text-primary hover:underline">{customer.phone}</a></p>
        <p className="flex items-start gap-2"><Home className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{address}</p>
        <p className="flex items-center gap-2">{customer.marketingConsent ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}Customer consent flag: {customer.marketingConsent ? 'Yes' : 'No'}</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Order Statistics</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p className="flex justify-between"><span>Delivery Orders</span><strong>{deliveryOrdersCount}</strong></p>
        <p className="flex justify-between"><span>Pickup Orders</span><strong>{pickupOrdersCount}</strong></p>
        <p className="flex justify-between"><span>Retention Rate</span><strong>{retentionRate}%</strong></p>
        <p className="text-xs text-muted-foreground">Statistics for this merchant record.</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Cookie Consent</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        {customer.cookie_consent ? <><p>Given: Yes · {consentDate ? format(consentDate, 'MMM d, yyyy HH:mm') : 'Date unknown'}</p><p>Version: {customer.cookie_consent.consent_version || '—'}</p><p>Marketing: {customer.cookie_consent.marketing ? 'Yes' : 'No'} · Statistics: {customer.cookie_consent.statistics ? 'Yes' : 'No'} · Functional: {customer.cookie_consent.functional ? 'Yes' : 'No'}</p>{customer.cookie_consent.origin_brand && <p>Origin brand: {customer.cookie_consent.origin_brand}</p>}{customer.cookie_consent.linked_anon_id && <p>Linked ID: {customer.cookie_consent.linked_anon_id.slice(0, 8)}…</p>}</> : <p className="flex items-center gap-2 text-muted-foreground"><Cookie className="h-5 w-5" />No cookie consent recorded.</p>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Newsletter Status</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{history.newsletters.map(row => <div key={row.brandId}><p className="font-medium">{row.merchant}</p><Badge variant={row.status === 'subscribed' ? 'default' : 'secondary'}>{row.status === 'subscribed' ? 'Subscribed' : row.status === 'pending' ? 'Pending confirmation' : row.status === 'not_subscribed' ? 'Not subscribed' : 'Unknown'}</Badge><p className="mt-1 text-xs text-muted-foreground">{row.note}</p></div>)}</CardContent></Card>
    </div>

    <CustomerHistory {...history} />
  </div>;
}
