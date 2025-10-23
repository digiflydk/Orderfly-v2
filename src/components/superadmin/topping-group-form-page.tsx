
'use client';

import { useEffect, useMemo, useState, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ToppingGroup, Location, Brand } from '@/types';
import { createOrUpdateToppingGroup, type FormState } from '@/app/superadmin/toppings/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { useRouter } from 'next/navigation';

interface ToppingGroupFormPageProps {
  group?: ToppingGroup | null;
  locations: Location[];
  brands: any[];
}

function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create Group')}
    </Button>
  );
}

export function ToppingGroupFormPage({ group, locations, brands }: ToppingGroupFormPageProps) {
  const { toast } = useToast();
  const [state, formAction] = useActionState(createOrUpdateToppingGroup, null);
  
  const [selectedBrandId, setSelectedBrandId] = useState<string>(() => {
     if(group) {
        const loc = locations.find(l => group.locationIds.includes(l.id));
        return loc?.brandId || '';
     }
     return '';
  });
  
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(group?.locationIds || []);
  
  const availableLocations = useMemo(() => {
    if (!selectedBrandId) return [];
    return locations.filter(l => l.brandId === selectedBrandId);
  }, [selectedBrandId, locations]);

  useEffect(() => {
    if (state?.error) {
        toast({ variant: 'destructive', title: 'Error', description: state.message });
    }
  }, [state, toast]);

  const title = group ? 'Edit Topping Group' : 'Create New Topping Group';
  const description = group ? `Editing details for ${group.groupName}.` : 'Fill in the details for the new group.';

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
        </div>
        <form action={formAction} className="space-y-6">
            {group?.id && <input type="hidden" name="id" value={group.id} />}
            <Card>
                <CardContent className="pt-6 space-y-4">
                    <div>
                        <Label htmlFor="groupName">Group Name</Label>
                        <Input id="groupName" name="groupName" placeholder="e.g., Sauces, Extra Toppings" defaultValue={group?.groupName} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="minSelection">Min. Selection</Label>
                            <Input id="minSelection" name="minSelection" type="number" placeholder="0" defaultValue={group?.minSelection ?? 0} />
                        </div>
                        <div>
                            <Label htmlFor="maxSelection">Max. Selection</Label>
                            <Input id="maxSelection" name="maxSelection" type="number" placeholder="1" defaultValue={group?.maxSelection ?? 1} />
                            <p className="text-xs text-muted-foreground mt-1">Set to 0 for unlimited selections.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Brand</Label>
                        <Select onValueChange={(value) => { setSelectedBrandId(value); setSelectedLocationIds([]); }} value={selectedBrandId}>
                            <SelectTrigger><SelectValue placeholder="Select a brand" /></SelectTrigger>
                            <SelectContent>
                                {brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label>Available at Locations</Label>
                        <ScrollArea className="h-32 rounded-md border">
                            <div className="p-4 space-y-2">
                            {availableLocations.length > 0 ? availableLocations.map((item) => (
                                <div key={item.id} className="flex flex-row items-start space-x-3 space-y-0">
                                    <Checkbox
                                        id={`loc-${item.id}`}
                                        name="locationIds"
                                        value={item.id}
                                        checked={selectedLocationIds.includes(item.id)}
                                        onCheckedChange={(checked) => {
                                            setSelectedLocationIds(prev => checked ? [...prev, item.id] : prev.filter(id => id !== item.id));
                                        }}
                                    />
                                    <Label htmlFor={`loc-${item.id}`} className="font-normal">{item.name}</Label>
                                </div>
                            )) : <p className="text-sm text-center text-muted-foreground p-4">Select a brand to see locations.</p>}
                            </div>
                        </ScrollArea>
                    </div>

                </CardContent>
                 <CardFooter className="flex justify-end gap-2">
                    <Button type="button" variant="outline" asChild>
                        <Link href="/superadmin/toppings">Cancel</Link>
                    </Button>
                    <SubmitButton isEditing={!!group} />
                </CardFooter>
            </Card>
        </form>
    </div>
  );
}
