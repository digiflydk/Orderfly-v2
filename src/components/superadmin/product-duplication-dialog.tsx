
'use client';

import { useState, useMemo, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { duplicateProducts } from '@/app/superadmin/products/actions';
import type { Brand, Location } from '@/types';

interface ProductDuplicationDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  productIds: string[];
  brands: Brand[];
  locations: Location[];
  onSuccess: () => void;
}

export function ProductDuplicationDialog({
  isOpen,
  setIsOpen,
  productIds,
  brands,
  locations,
  onSuccess,
}: ProductDuplicationDialogProps) {
  const { toast } = useToast();
  const [targetBrandId, setTargetBrandId] = useState('');
  const [targetLocationIds, setTargetLocationIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const availableLocations = useMemo(() => {
    if (!targetBrandId) return [];
    return locations.filter(l => l.brandId === targetBrandId);
  }, [targetBrandId, locations]);

  const handleDuplicate = () => {
    if (!targetBrandId) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select a target brand.' });
        return;
    }
    if (targetLocationIds.length === 0) {
        toast({ variant: 'destructive', title: 'Error', description: 'Please select at least one target location.' });
        return;
    }

    startTransition(async () => {
      const result = await duplicateProducts({
        productIds,
        targetBrandId,
        targetLocationIds,
      });

      if (result.success) {
        toast({ title: 'Success!', description: result.message });
        setIsOpen(false);
        onSuccess();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  };
  
  const handleLocationSelect = (locationId: string, checked: boolean) => {
      setTargetLocationIds(prev => {
          if (checked) {
              return [...prev, locationId];
          } else {
              return prev.filter(id => id !== locationId);
          }
      });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate {productIds.length} Product(s)</DialogTitle>
          <DialogDescription>
            Select a new brand and locations for the duplicated products.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="target-brand">Target Brand</Label>
            <Select onValueChange={setTargetBrandId} value={targetBrandId}>
              <SelectTrigger id="target-brand">
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target Locations</Label>
             <ScrollArea className="h-40 rounded-md border">
                <div className="p-4 space-y-2">
                    {availableLocations.map(location => (
                        <div key={location.id} className="flex items-center space-x-2">
                            <Checkbox 
                                id={`loc-${location.id}`} 
                                checked={targetLocationIds.includes(location.id)}
                                onCheckedChange={(checked) => handleLocationSelect(location.id, !!checked)}
                            />
                            <Label htmlFor={`loc-${location.id}`} className="font-normal">{location.name}</Label>
                        </div>
                    ))}
                    {availableLocations.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            {targetBrandId ? "No locations for this brand." : "Select a brand to see locations."}
                        </p>
                    )}
                </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleDuplicate} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Duplicate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
