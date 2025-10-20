
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, X, MoreHorizontal, Eye, Star, Trash2 } from "lucide-react";
import type { Feedback, Brand, Location } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { updateFeedback, deleteFeedback } from './actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';

type FeedbackWithDetails = Feedback & {
    brandName: string;
    locationName: string;
    customerName: string;
    questionVersionLabel: string;
};

interface FeedbackClientPageProps {
    initialFeedback: FeedbackWithDetails[];
    brands: Brand[];
    locations: Location[];
}

const RatingStars = ({ rating }: { rating: number }) => (
  <div className="flex items-center">
    {[...Array(5)].map((_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
    ))}
  </div>
);

export function FeedbackClientPage({ initialFeedback, brands, locations }: FeedbackClientPageProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [feedbackList, setFeedbackList] = useState(initialFeedback);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
      brandId: 'all',
      locationId: 'all',
      rating: 'all',
      showPublicly: 'all',
      isMasked: 'all',
  });
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [feedbackToDelete, setFeedbackToDelete] = useState<string | null>(null);

  const filteredFeedback = useMemo(() => {
    return feedbackList.filter(f => {
      const searchMatch = searchQuery === '' ||
        f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.comment && f.comment.toLowerCase().includes(searchQuery.toLowerCase()));

      const brandMatch = filters.brandId === 'all' || f.brandId === filters.brandId;
      const locationMatch = filters.locationId === 'all' || f.locationId === filters.locationId;
      const ratingMatch = filters.rating === 'all' || f.rating === parseInt(filters.rating);
      const publicMatch = filters.showPublicly === 'all' || String(f.showPublicly) === filters.showPublicly;
      const maskedMatch = filters.isMasked === 'all' || String(f.maskCustomerName) === filters.isMasked;
      
      return searchMatch && brandMatch && locationMatch && ratingMatch && publicMatch && maskedMatch;
    });
  }, [feedbackList, searchQuery, filters]);

  const handleFilterChange = (filterName: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const handleToggle = async (id: string, field: 'showPublicly' | 'maskCustomerName', value: boolean) => {
      setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
      const result = await updateFeedback(id, { [field]: value });
      if (result.error) {
          toast({ variant: 'destructive', title: 'Error', description: result.message });
          // Revert UI change on error
          setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, [field]: !value } : f));
      } else {
          toast({ title: 'Success', description: 'Feedback updated.'});
      }
  };
  
  const confirmDelete = (id: string) => {
      setFeedbackToDelete(id);
      setIsAlertOpen(true);
  };
  
  const handleDelete = async () => {
    if (!feedbackToDelete) return;
    const result = await deleteFeedback(feedbackToDelete);
    if (result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
        setFeedbackList(prev => prev.filter(f => f.id !== feedbackToDelete));
        router.refresh();
    }
    setIsAlertOpen(false);
    setFeedbackToDelete(null);
  };

  const isFiltered = searchQuery !== '' || Object.values(filters).some(v => v !== 'all');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Search by Order, Customer, Comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lg:col-span-2"
            />
            <Select value={filters.brandId} onValueChange={(v) => handleFilterChange('brandId', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by brand..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.locationId} onValueChange={(v) => handleFilterChange('locationId', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by location..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Locations</SelectItem>
                {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.rating} onValueChange={(v) => handleFilterChange('rating', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by rating..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ratings</SelectItem>
                {[1,2,3,4,5].map(r => <SelectItem key={r} value={String(r)}>{r} star{r>1 && 's'}</SelectItem>)}
              </SelectContent>
            </Select>
             <Select value={filters.showPublicly} onValueChange={(v) => handleFilterChange('showPublicly', v)}>
              <SelectTrigger><SelectValue placeholder="Filter by visibility..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Visibility</SelectItem>
                <SelectItem value="true">Public</SelectItem>
                <SelectItem value="false">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isFiltered && (
            <Button variant="ghost" onClick={() => { setSearchQuery(''); setFilters({ brandId: 'all', locationId: 'all', rating: 'all', showPublicly: 'all', isMasked: 'all' })}}>
              <X className="mr-2 h-4 w-4" /> Clear Filters
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feedback ID</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Show Publicly</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFeedback.map((feedback) => (
                <TableRow key={feedback.id}>
                  <TableCell className="font-mono text-xs">{feedback.id.substring(0,6).toUpperCase()}</TableCell>
                  <TableCell><RatingStars rating={feedback.rating} /></TableCell>
                  <TableCell>{feedback.maskCustomerName ? 'Anonymous' : feedback.customerName}</TableCell>
                  <TableCell>{feedback.locationName}</TableCell>
                  <TableCell>{format(new Date(feedback.receivedAt), 'MMM d, yyyy')}</TableCell>
                  <TableCell>
                      <Switch
                        checked={feedback.showPublicly}
                        onCheckedChange={(val) => handleToggle(feedback.id, 'showPublicly', val)}
                      />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/feedback/${feedback.id}`}><Eye className="mr-2 h-4 w-4" /> View Details</Link>
                        </DropdownMenuItem>
                         <DropdownMenuItem onSelect={(e) => { e.preventDefault(); confirmDelete(feedback.id); }} className="text-destructive">
                           <Trash2 className="mr-2 h-4 w-4" /> Delete
                         </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filteredFeedback.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No feedback entries found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
          <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete this feedback entry. This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
