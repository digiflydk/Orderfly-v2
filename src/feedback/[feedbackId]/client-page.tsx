

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Star, MessageSquare, User, Home, Tag, Check, X, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Feedback } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { updateFeedback, deleteFeedback } from '../actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';

type FullFeedback = Feedback & {
    brandName: string;
    locationName: string;
    customerName: string;
};

interface FeedbackDetailClientProps {
    initialFeedback: FullFeedback;
}

const RatingStars = ({ rating }: { rating: number }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className={`h-6 w-6 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
    ))}
  </div>
);

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

function renderAnswer(response: any) {
    if (response.type === 'stars') {
        return <RatingStars rating={response.answer} />;
    }
    if (response.type === 'nps') {
        return <p className="font-bold text-lg">{response.answer} / 10</p>;
    }
    if (response.type === 'text') {
        return <p className="text-muted-foreground whitespace-pre-wrap">{response.answer}</p>;
    }
    if (Array.isArray(response.answer)) {
        return (
            <div className="flex flex-wrap gap-2">
                {response.answer.map((tag: string, index: number) => (
                    <Badge key={index} variant="secondary">{tag}</Badge>
                ))}
            </div>
        );
    }
    return <p>{String(response.answer)}</p>;
}


export function FeedbackDetailClient({ initialFeedback }: FeedbackDetailClientProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [feedback, setFeedback] = useState(initialFeedback);
    const [isPending, startTransition] = useTransition();

    const handleToggle = (field: 'showPublicly' | 'maskCustomerName', value: boolean) => {
        const originalValue = feedback[field];
        setFeedback(prev => ({...prev, [field]: value})); // Optimistic update

        startTransition(async () => {
            const result = await updateFeedback(feedback.id, { [field]: value });
            if (result.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
                setFeedback(prev => ({...prev, [field]: originalValue})); // Revert on error
            } else {
                toast({ title: 'Success', description: 'Feedback updated.'});
            }
        });
    };
    
     const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setFeedback(prev => ({ ...prev, internalNote: e.target.value }));
    };

    const handleSaveNote = () => {
        startTransition(async () => {
            const result = await updateFeedback(feedback.id, { internalNote: feedback.internalNote });
            if (result.error) {
                toast({ variant: 'destructive', title: 'Error', description: "Failed to save note." });
            } else {
                toast({ title: 'Success', description: 'Internal note saved.' });
            }
        });
    };

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteFeedback(feedback.id);
            if (result.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success!', description: result.message });
                router.push('/superadmin/feedback');
            }
        });
    };
    
    const customerName = feedback.maskCustomerName ? 'Anonymous' : (feedback.customerName || 'Unknown Customer');
    // @ts-ignore
    const responses = feedback.responses || {};

    return (
       <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <Button variant="outline" size="sm" asChild className="mb-2">
                        <Link href="/superadmin/feedback">
                            <ArrowLeft className="mr-2" />
                            Back to All Feedback
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">Feedback ID: <span className="font-mono text-primary bg-muted px-2 py-1 rounded-sm">{feedback.id.substring(0,6).toUpperCase()}</span></h1>
                    <p className="text-muted-foreground">
                       For Order <Link href={`/superadmin/sales/orders/${feedback.orderId}`} className="font-mono text-primary hover:underline">{feedback.orderId}</Link>
                    </p>
                </div>
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={isPending}><Trash2 className="mr-2"/>Delete Feedback</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This action will permanently delete this feedback entry and cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
            
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Responses</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             {Object.keys(responses).length > 0 ? (
                                Object.entries(responses).map(([qid, response]: [string, any]) => (
                                    <div key={qid}>
                                        <h4 className="font-semibold mb-2">{response.questionLabel || qid}</h4>
                                        {renderAnswer(response)}
                                        <Separator className="mt-4"/>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground">No responses found for this feedback.</p>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Moderation & Notes</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <Label htmlFor="internalNote">Internal Note</Label>
                                <Textarea 
                                    id="internalNote"
                                    placeholder="Add internal notes about this feedback..."
                                    value={feedback.internalNote || ''}
                                    onChange={handleNoteChange}
                                />
                                <Button size="sm" onClick={handleSaveNote} disabled={isPending}>Save Note</Button>
                             </div>
                        </CardContent>
                    </Card>
                </div>
                 {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Moderation</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="showPublicly" className="flex flex-col gap-1"><span>Show Publicly</span><span className="text-xs font-normal text-muted-foreground">Display on the webshop.</span></Label>
                                <Switch id="showPublicly" checked={feedback.showPublicly} onCheckedChange={(v) => handleToggle('showPublicly', v)} disabled={isPending} />
                            </div>
                             <div className="flex items-center justify-between">
                                <Label htmlFor="maskCustomerName" className="flex flex-col gap-1"><span>Mask Name</span><span className="text-xs font-normal text-muted-foreground">Hide customer name.</span></Label>
                                <Switch id="maskCustomerName" checked={feedback.maskCustomerName} onCheckedChange={(v) => handleToggle('maskCustomerName', v)} disabled={isPending} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4 text-sm">
                            <InfoItem icon={User} label="Customer">{customerName}</InfoItem>
                            <InfoItem icon={Home} label="Brand / Location">{feedback.brandName} / {feedback.locationName}</InfoItem>
                            <InfoItem icon={MessageSquare} label="Submitted At">{format(new Date(feedback.receivedAt), 'MMM d, yyyy HH:mm')}</InfoItem>
                            <InfoItem icon={Tag} label="Version">{feedback.questionVersionId}</InfoItem>
                             {feedback.autoResponseSent ? (
                                <InfoItem icon={CheckCircle} label="Auto-response">Sent</InfoItem>
                            ) : (
                                <InfoItem icon={XCircle} label="Auto-response">Not Sent</InfoItem>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
       </div>
    );
}
