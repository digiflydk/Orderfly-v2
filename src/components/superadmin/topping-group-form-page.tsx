
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { useEffect, useMemo, useState, useTransition, useActionState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';

import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ToppingGroup, Location, Brand } from '@/types';
import { createOrUpdateToppingGroup, type FormState } from '@/app/superadmin/toppings/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../ui/card';
import { useRouter } from 'next/navigation';

const toppingGroupSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupName: z.string().min(2, { message: 'Group name must be at least 2 characters.' }),
  minSelection: z.coerce.number().min(0, "Min selection must be 0 or more."),
  maxSelection: z.coerce.number().min(0, "Max selection must be 0 or more."),
}).refine(data => data.maxSelection === 0 || data.maxSelection >= data.minSelection, {
    message: "Max selection must be 0 (for unlimited) or greater than or equal to min selection.",
    path: ["maxSelection"],
});

type GroupFormValues = z.infer<typeof toppingGroupSchema>;

interface ToppingGroupFormPageProps {
  group?: ToppingGroup | null;
  locations: Location[];
  brands: any[]; // Assuming brands might be needed for filtering locations in future
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

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(toppingGroupSchema),
    defaultValues: group || {
        locationIds: [],
        groupName: '',
        minSelection: 0,
        maxSelection: 1,
    },
  });

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
        <Form {...form}>
            <form action={formAction} className="space-y-6">
                 {group?.id && <input type="hidden" name="id" value={group.id} />}
                <Card>
                    <CardContent className="pt-6 space-y-4">
                        <FormField control={form.control} name="groupName" render={({ field }) => (
                        <FormItem><FormLabel>Group Name</FormLabel><FormControl><Input placeholder="e.g., Sauces, Extra Toppings" {...field} /></FormControl><FormMessage /></FormItem>
                        )}/>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="minSelection" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Min Selection</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="0" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                            <FormField control={form.control} name="maxSelection" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Max Selection</FormLabel>
                                    <FormControl>
                                        <Input type="number" placeholder="1" {...field} />
                                    </FormControl>
                                    <FormDescription>Set to 0 for unlimited selections.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}/>
                        </div>
                        
                        <FormField
                        control={form.control}
                        name="locationIds"
                        render={() => (
                            <FormItem>
                            <FormLabel>Available at Locations</FormLabel>
                            <div className="rounded-md border max-h-48 overflow-y-auto">
                                <div className="p-4 space-y-2">
                                {locations.map((item) => (
                                    <FormField
                                    key={item.id}
                                    control={form.control}
                                    name="locationIds"
                                    render={({ field }) => {
                                        return (
                                        <FormItem
                                            key={item.id}
                                            className="flex flex-row items-start space-x-3 space-y-0"
                                        >
                                            <FormControl>
                                            <Checkbox
                                                checked={field.value?.includes(item.id)}
                                                onCheckedChange={(checked) => {
                                                const currentValue = field.value || [];
                                                const newValue = checked
                                                    ? [...currentValue, item.id]
                                                    : currentValue.filter((value) => value !== item.id);
                                                field.onChange(newValue);
                                                }}
                                            />
                                            </FormControl>
                                            <FormLabel className="font-normal cursor-pointer">
                                            {item.name}
                                            </FormLabel>
                                        </FormItem>
                                        )
                                    }}
                                    />
                                ))}
                                </div>
                            </div>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </CardContent>
                     <CardFooter className="flex justify-end gap-2">
                        <Button type="button" variant="outline" asChild>
                            <Link href="/superadmin/toppings">Cancel</Link>
                        </Button>
                        <SubmitButton isEditing={!!group} />
                    </CardFooter>
                </Card>
            </form>
        </Form>
    </div>
  );
}
