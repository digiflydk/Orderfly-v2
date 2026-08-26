'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, Home, MessageSquare, Star, Tag, Trash2, User, XCircle } from 'lucide-react';

import type { Feedback } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { deleteFeedback, updateFeedback } from '../actions';
import { useRouter } from 'next/navigation';

type FullFeedback = Feedback & {
  brandName: string;
  locationName: string;
  customerName: string;
  sourceType?: 'commerce_order' | 'booking';
  sourceId?: string;
};

const RatingStars = ({ rating }: { rating: number }) => <div className="flex items-center">{[...Array(5)].map((_, i) => <Star key={i} className={`h-6 w-6 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />)}</div>;

function InfoItem({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return <div className="flex items-start"><Icon className="mr-3 mt-1 h-4 w-4 text-muted-foreground" /><div className="flex-1"><p className="text-sm text-muted-foreground">{label}</p><div className="font-medium">{children}</div></div></div>;
}

function renderAnswer(response: any) {
  if (response?.type === 'stars') return <RatingStars rating={Number(response.answer || 0)} />;
  if (response?.type === 'nps') return <p className="text-lg font-bold">{response.answer} / 10</p>;
  if (response?.type === 'text') return <p className="whitespace-pre-wrap text-muted-foreground">{response.answer}</p>;
  if (Array.isArray(response?.answer)) return <div className="flex flex-wrap gap-2">{response.answer.map((tag: string, index: number) => <Badge key={`${tag}-${index}`} variant="secondary">{tag}</Badge>)}</div>;
  return <p>{String(response?.answer ?? '')}</p>;
}

export function FeedbackDetailClient({ initialFeedback }: { initialFeedback: FullFeedback }) {
  const { toast } = useToast();
  const router = useRouter();
  const [feedback, setFeedback] = useState(initialFeedback);
  const [isPending, startTransition] = useTransition();
  const sourceType = feedback.sourceType === 'booking' ? 'booking' : 'commerce_order';
  const sourceId = feedback.sourceId || feedback.orderId || feedback.id;
  const responses = (feedback as any).responses || {};

  const toggle = (field: 'showPublicly' | 'maskCustomerName', value: boolean) => {
    const previous = feedback[field];
    setFeedback((current) => ({ ...current, [field]: value }));
    startTransition(async () => {
      const result = await updateFeedback(feedback.id, { [field]: value });
      if (result.error) {
        setFeedback((current) => ({ ...current, [field]: previous }));
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  };

  const saveNote = () => startTransition(async () => {
    const result = await updateFeedback(feedback.id, { internalNote: feedback.internalNote });
    toast(result.error ? { variant: 'destructive', title: 'Error', description: result.message } : { title: 'Saved', description: 'Internal note saved.' });
  });

  const remove = () => startTransition(async () => {
    const result = await deleteFeedback(feedback.id);
    if (result.error) toast({ variant: 'destructive', title: 'Error', description: result.message });
    else router.push('/superadmin/feedback');
  });

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <Button variant="outline" size="sm" asChild className="mb-2"><Link href="/superadmin/feedback"><ArrowLeft className="mr-2 h-4 w-4" />Back to All Feedback</Link></Button>
        <h1 className="text-2xl font-bold tracking-tight">Feedback <span className="rounded-sm bg-muted px-2 py-1 font-mono text-primary">{feedback.id.substring(0, 6).toUpperCase()}</span></h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={sourceType === 'booking' ? 'secondary' : 'outline'}>{sourceType === 'booking' ? 'Restaurant booking' : 'Online order'}</Badge>
          {sourceType === 'commerce_order' && feedback.orderId ? <Link href={`/superadmin/sales/orders/${feedback.orderId}`} className="font-mono text-sm text-primary hover:underline">{sourceId}</Link> : <span className="font-mono text-sm text-muted-foreground">{sourceId}</span>}
        </div>
      </div>
      <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive" disabled={isPending}><Trash2 className="mr-2 h-4 w-4" />Delete Feedback</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete feedback?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card><CardHeader><CardTitle>Customer Responses</CardTitle></CardHeader><CardContent className="space-y-6">{Object.keys(responses).length ? Object.entries(responses).map(([id, response]: [string, any]) => <div key={id}><h4 className="mb-2 font-semibold">{response.questionLabel || id}</h4>{renderAnswer(response)}<Separator className="mt-4" /></div>) : <p className="text-muted-foreground">No responses found.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Moderation & Notes</CardTitle></CardHeader><CardContent className="space-y-3"><Label htmlFor="internalNote">Internal Note</Label><Textarea id="internalNote" value={feedback.internalNote || ''} onChange={(event) => setFeedback((current) => ({ ...current, internalNote: event.target.value }))} /><Button size="sm" onClick={saveNote} disabled={isPending}>Save Note</Button></CardContent></Card>
      </div>

      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Moderation</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><Label htmlFor="showPublicly">Show Publicly</Label><Switch id="showPublicly" checked={feedback.showPublicly} onCheckedChange={(value) => toggle('showPublicly', value)} /></div><div className="flex items-center justify-between"><Label htmlFor="maskCustomerName">Mask Name</Label><Switch id="maskCustomerName" checked={feedback.maskCustomerName} onCheckedChange={(value) => toggle('maskCustomerName', value)} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><InfoItem icon={User} label="Customer">{feedback.maskCustomerName ? 'Anonymous' : feedback.customerName}</InfoItem><InfoItem icon={Home} label="Brand / Location">{feedback.brandName} / {feedback.locationName}</InfoItem><InfoItem icon={MessageSquare} label="Submitted At">{format(new Date(feedback.receivedAt), 'MMM d, yyyy HH:mm')}</InfoItem><InfoItem icon={Tag} label="Source">{sourceType === 'booking' ? 'Restaurant booking' : 'Online order'} · {sourceId}</InfoItem>{feedback.autoResponseSent ? <InfoItem icon={CheckCircle} label="Auto-response">Sent</InfoItem> : <InfoItem icon={XCircle} label="Auto-response">Not Sent</InfoItem>}</CardContent></Card>
      </div>
    </div>
  </div>;
}
