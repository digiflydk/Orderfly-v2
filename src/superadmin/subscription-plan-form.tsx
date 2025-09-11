

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import type { SubscriptionPlan } from '@/types';
import { createOrUpdatePlan, type FormState } from '@/app/superadmin/subscriptions/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const planSchema = z.object({
  name: z.string().min(2, { message: 'Plan name must be at least 2 characters.' }),
  priceMonthly: z.coerce.number().min(0, { message: 'Price must be a positive number.' }),
  priceYearly: z.coerce.number().min(0, { message: 'Price must be a positive number.' }),
  serviceFee: z.coerce.number().min(0).max(100, { message: 'Service fee must be between 0 and 100.' }),
  isActive: z.boolean().default(false),
  isMostPopular: z.boolean().default(false),
});

type PlanFormValues = z.infer<typeof planSchema>;

interface SubscriptionPlanFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  plan: SubscriptionPlan | null;
}

export function SubscriptionPlanForm({ isOpen, setIsOpen, plan }: SubscriptionPlanFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      priceMonthly: undefined,
      priceYearly: undefined,
      serviceFee: undefined,
      isActive: true,
      isMostPopular: false,
    },
  });

  useEffect(() => {
    if (plan) {
      form.reset({
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        serviceFee: plan.serviceFee,
        isActive: plan.isActive,
        isMostPopular: plan.isMostPopular,
      });
    } else {
      form.reset({
        name: '',
        priceMonthly: undefined,
        priceYearly: undefined,
        serviceFee: undefined,
        isActive: true,
        isMostPopular: false,
      });
    }
  }, [plan, form, isOpen]);

  const handleFormSubmit = form.handleSubmit((data) => {
    const formData = new FormData();
    if (plan?.id) {
        formData.append('id', plan.id);
    }
    formData.append('name', data.name);
    formData.append('priceMonthly', data.priceMonthly.toString());
    formData.append('priceYearly', data.priceYearly.toString());
    formData.append('serviceFee', data.serviceFee.toString());
    if (data.isActive) formData.append('isActive', 'on');
    if (data.isMostPopular) formData.append('isMostPopular', 'on');

    startTransition(async () => {
        const result = await createOrUpdatePlan(null, formData);
        if (result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
            setIsOpen(false);
        }
    });
  });

  const title = plan ? 'Edit Plan' : 'Create New Subscription Plan';
  const description = plan ? `Editing details for the ${plan.name} plan.` : 'Fill in the details for the new plan.';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form action={handleFormSubmit} className="space-y-4 py-4">
            {plan && <input type="hidden" name="id" value={plan.id} />}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Pro Plan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="priceMonthly"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Price (kr.)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priceYearly"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yearly Price (kr.)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="serviceFee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Fee (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" placeholder="0.0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
             <div className="space-y-2">
                <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                            <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                                Is this plan available for new subscriptions?
                            </FormDescription>
                        </div>
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="isMostPopular"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                            <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                            <FormLabel>Most Popular</FormLabel>
                            <FormDescription>
                                Highlight this plan on the pricing page.
                            </FormDescription>
                        </div>
                        </FormItem>
                    )}
                />
             </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : (plan ? 'Save Changes' : 'Create Plan')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
