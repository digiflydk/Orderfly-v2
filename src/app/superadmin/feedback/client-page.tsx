'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Eye, MoreHorizontal, Star, Trash2, X } from 'lucide-react';

import type { Brand, Feedback, Location } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { deleteFeedback, updateFeedback } from './actions';

type FeedbackWithDetails = Feedback & {
  brandName: string;
  locationName: string;
  customerName: string;
  questionVersionLabel: string;
  sourceType?: 'commerce_order' | 'booking';
  sourceId?: string;
};

interface FeedbackClientPageProps {
  initialFeedback: FeedbackWithDetails[];
  brands: Brand[];
  locations: Location[];
}

const RatingStars = ({ rating }: { rating: number }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
    ))}
  </div>
);

const sourceOf = (feedback: FeedbackWithDetails) =>
  feedback.sourceType === 'booking' ? 'booking' : 'commerce_order';

export function FeedbackClientPage({ initialFeedback, brands, locations }: FeedbackClientPageProps) {
  const { toast } = useToast();
  const [feedbackList, setFeedbackList] = useState(initialFeedback);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ brandId: 'all', locationId: 'all', rating: 'all', source: 'all', showPublicly: 'all' });
  const [feedbackToDelete, setFeedbackToDelete] = useState<string | null>(null);

  const filteredFeedback = useMemo(() => feedbackList.filter((feedback) => {
    const sourceId = feedback.sourceId || feedback.orderId || '';
    const search = searchQuery.toLowerCase();
    const searchMatch = !search || feedback.id.toLowerCase().includes(search) || sourceId.toLowerCase().includes(search) || feedback.customerName.toLowerCase().includes(search) || Boolean(feedback.comment?.toLowerCase().includes(search));
    return searchMatch
      && (filters.brandId === 'all' || feedback.brandId === filters.brandId)
      && (filters.locationId === 'all' || feedback.locationId === filters.locationId)
      && (filters.rating === 'all' || feedback.rating === Number(filters.rating))
      && (filters.source === 'all' || sourceOf(feedback) === filters.source)
      && (filters.showPublicly === 'all' || String(feedback.showPublicly) === filters.showPublicly);
  }), [feedbackList, filters, searchQuery]);

  const toggle = async (id: string, value: boolean) => {
    setFeedbackList((current) => current.map((feedback) => feedback.id === id ? { ...feedback, showPublicly: value } : feedback));
    const result = await updateFeedback(id, { showPublicly: value });
    if (result.error) {
      setFeedbackList((current) => current.map((feedback) => feedback.id === id ? { ...feedback, showPublicly: !value } : feedback));
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const remove = async () => {
    if (!feedbackToDelete) return;
    const result = await deleteFeedback(feedbackToDelete);
    if (result.error) toast({ variant: 'destructive', title: 'Error', description: result.message });
    else setFeedbackList((current) => current.filter((feedback) => feedback.id !== feedbackToDelete));
    setFeedbackToDelete(null);
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-6">
        <Input className="lg:col-span-2" placeholder="Search customer, order, booking or comment..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
        <Select value={filters.source} onValueChange={(source) => setFilters({ ...filters, source })}><SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger><SelectContent><SelectItem value="all">All Sources</SelectItem><SelectItem value="commerce_order">Online orders</SelectItem><SelectItem value="booking">Bookings</SelectItem></SelectContent></Select>
        <Select value={filters.brandId} onValueChange={(brandId) => setFilters({ ...filters, brandId })}><SelectTrigger><SelectValue placeholder="Brand" /></SelectTrigger><SelectContent><SelectItem value="all">All Brands</SelectItem>{brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select>
        <Select value={filters.locationId} onValueChange={(locationId) => setFilters({ ...filters, locationId })}><SelectTrigger><SelectValue placeholder="Location" /></SelectTrigger><SelectContent><SelectItem value="all">All Locations</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select>
        <Button variant="ghost" onClick={() => { setSearchQuery(''); setFilters({ brandId: 'all', locationId: 'all', rating: 'all', source: 'all', showPublicly: 'all' }); }}><X className="mr-2 h-4 w-4" />Clear</Button>
      </CardContent></Card>

      <Card><CardContent className="pt-6"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Rating</TableHead><TableHead>Customer</TableHead><TableHead>Location</TableHead><TableHead>Date</TableHead><TableHead>Public</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {filteredFeedback.map((feedback) => {
            const source = sourceOf(feedback);
            const sourceId = feedback.sourceId || feedback.orderId || feedback.id;
            return <TableRow key={feedback.id}>
              <TableCell><div className="space-y-1"><Badge variant={source === 'booking' ? 'secondary' : 'outline'}>{source === 'booking' ? 'Booking' : 'Online order'}</Badge><div className="max-w-36 truncate font-mono text-xs text-muted-foreground" title={sourceId}>{sourceId}</div></div></TableCell>
              <TableCell><RatingStars rating={feedback.rating} /></TableCell>
              <TableCell>{feedback.maskCustomerName ? 'Anonymous' : feedback.customerName}</TableCell>
              <TableCell>{feedback.locationName}</TableCell>
              <TableCell>{format(new Date(feedback.receivedAt), 'MMM d, yyyy')}</TableCell>
              <TableCell><Switch checked={feedback.showPublicly} onCheckedChange={(value) => toggle(feedback.id, value)} /></TableCell>
              <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/superadmin/feedback/${feedback.id}`}><Eye className="mr-2 h-4 w-4" />View</Link></DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={(event) => { event.preventDefault(); setFeedbackToDelete(feedback.id); }}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
            </TableRow>;
          })}
          {filteredFeedback.length === 0 && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No feedback entries found.</TableCell></TableRow>}
        </TableBody>
      </Table></div></CardContent></Card>

      <AlertDialog open={Boolean(feedbackToDelete)} onOpenChange={(open) => { if (!open) setFeedbackToDelete(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete feedback?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the feedback entry.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
