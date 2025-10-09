
'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTransition } from 'react';
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
import type { ToppingGroup, Location } from '@/types';
import { createOrUpdateToppingGroup } from '@/app/superadmin/toppings/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';

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

export function ToppingGroupFormPage({ group, locations, brands }: ToppingGroupFormPageProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(toppingGroupSchema),
    defaultValues: group || {
        locationIds: [],
        groupName: '',
        minSelection: 0,
        maxSelection: 1,
    },
  });

  const onSubmit = (data: GroupFormValues) => {
    const formData = new FormData();
    if (group?.id) {
        formData.append('id', group.id);
    }
    Object.entries(data).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined && value !== null) {
            if (Array.isArray(value)) {
                value.forEach(item => formData.append(key, item));
            } else {
                formData.append(key, String(value));
            }
        }
    });

    startTransition(async () => {
        const result = await createOrUpdateToppingGroup(null, formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
        }
    });
  }

  const title = group ? 'Edit Topping Group' : 'Create New Topping Group';
  const description = group ? `Editing details for ${group.groupName}.` : 'Fill in the details for the new group.';

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href="/superadmin/toppings">Cancel</Link>
                </Button>
                 <Button onClick={form.handleSubmit(onSubmit)} disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (group ? 'Save Changes' : 'Create Group')}</Button>
            </div>
        </div>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                                    return checked
                                                        ? field.onChange([...(field.value || []), item.id])
                                                        : field.onChange(
                                                            (field.value || [])?.filter(
                                                            (value) => value !== item.id
                                                            )
                                                        )
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
                </Card>
            </form>
        </Form>
    </div>
  );
}
