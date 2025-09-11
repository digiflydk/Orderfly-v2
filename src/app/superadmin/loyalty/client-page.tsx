

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoyaltySettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { updateLoyaltySettings, type FormState } from './actions';
import { Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';


const loyaltyThresholdSchema = z.array(z.object({
  points: z.coerce.number(),
  value: z.coerce.number(),
}));

const loyaltySettingsSchema = z.object({
    weights: z.object({
        totalOrders: z.coerce.number().min(0).max(100),
        averageOrderValue: z.coerce.number().min(0).max(100),
        recency: z.coerce.number().min(0).max(100),
        frequency: z.coerce.number().min(0).max(100),
        deliveryMethodBonus: z.coerce.number().min(0).max(100),
    }).refine(data => Object.values(data).reduce((acc, v) => acc + v, 0) === 100, {
        message: 'The sum of all weights must be exactly 100.',
        path: ['totalOrders'],
    }),
    thresholds: z.object({
        totalOrders: loyaltyThresholdSchema,
        averageOrderValue: loyaltyThresholdSchema,
        recency: loyaltyThresholdSchema,
        frequency: loyaltyThresholdSchema,
    }),
    deliveryMethodBonus: z.coerce.number().min(0),
    classifications: z.object({
        loyal: z.object({ min: z.coerce.number(), max: z.coerce.number() }),
        occasional: z.object({ min: z.coerce.number(), max: z.coerce.number() }),
        atRisk: z.object({ min: z.coerce.number(), max: z.coerce.number() }),
    }),
});

type LoyaltyFormValues = z.infer<typeof loyaltySettingsSchema>;

interface LoyaltySettingsClientPageProps {
    initialSettings: LoyaltySettings;
}

function ThresholdInput({ control, name, label, description }: { control: any, name: string, label: string, description: string }) {
    return (
        <FormField
            control={control}
            name={name}
            render={({ field }) => (
                <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormDescription>{description}</FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    )
}

export function LoyaltySettingsClientPage({ initialSettings }: LoyaltySettingsClientPageProps) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    
    const form = useForm<LoyaltyFormValues>({
        resolver: zodResolver(loyaltySettingsSchema),
        defaultValues: initialSettings,
    });
    
    const watchWeights = form.watch('weights');
    const totalWeight = Object.values(watchWeights).reduce((sum, w) => sum + w, 0);
    
    const handleFormSubmit = form.handleSubmit((data) => {
        const formData = new FormData();
        Object.entries(data).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                Object.entries(value).forEach(([subKey, subValue]) => {
                    if (typeof subValue === 'object' && subValue !== null) {
                         if (Array.isArray(subValue)) {
                             subValue.forEach((item, index) => {
                                 formData.append(`thresholds.${subKey}.${index}.value`, String(item.value));
                             })
                         } else {
                            Object.entries(subValue).forEach(([grandKey, grandValue]) => {
                                formData.append(`${key}.${subKey}.${grandKey}`, String(grandValue));
                            });
                         }
                    } else {
                        formData.append(`${key}.${subKey}`, String(subValue));
                    }
                });
            } else {
                formData.append(key, String(value));
            }
        });

        startTransition(async () => {
            const result = await updateLoyaltySettings(null, formData);
             if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else if (result?.message) {
                toast({ title: 'Success!', description: result.message });
            }
        });
    });

    return (
        <Form {...form}>
            <form onSubmit={handleFormSubmit} className="space-y-6">
                <div className="flex justify-end">
                    <Button type="submit" disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin" /> : 'Save Settings'}
                    </Button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Factor Weights</CardTitle>
                                <CardDescription>Distribute the importance of each factor. Total must be 100%.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {Object.keys(initialSettings.weights).map((key) => (
                                    <FormField
                                        key={key}
                                        control={form.control}
                                        name={`weights.${key as keyof LoyaltySettings['weights']}`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="capitalize flex justify-between">
                                                    <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                                                    <span>{field.value}%</span>
                                                </FormLabel>
                                                <FormControl>
                                                    <Slider
                                                        onValueChange={(value) => field.onChange(value[0])}
                                                        value={[field.value]}
                                                        max={100}
                                                        step={5}
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                                 <div className="text-right font-bold">
                                    Total: <span className={totalWeight !== 100 ? 'text-destructive' : 'text-green-600'}>{totalWeight}%</span>
                                </div>
                                {totalWeight !== 100 && <p className="text-sm text-destructive text-center">Total weight must be exactly 100%.</p>}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Classification Ranges</CardTitle>
                                <CardDescription>Define the score ranges for each loyalty tier.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                               <ThresholdInput control={form.control} name="classifications.loyal.min" label="Loyal Customer (min score)" description="Score >= this value." />
                                <ThresholdInput control={form.control} name="classifications.occasional.min" label="Occasional Customer (min score)" description="Score >= this value." />
                                <ThresholdInput control={form.control} name="classifications.occasional.max" label="Occasional Customer (max score)" description="Score <= this value." />
                                <ThresholdInput control={form.control} name="classifications.atRisk.max" label="At Risk Customer (max score)" description="Score <= this value." />
                            </CardContent>
                        </Card>
                    </div>
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader><CardTitle>Scoring Thresholds</CardTitle><CardDescription>Define points awarded for different levels of customer activity.</CardDescription></CardHeader>
                            <CardContent className="space-y-6">
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">Total Orders</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <ThresholdInput control={form.control} name="thresholds.totalOrders.0.value" label="1-2 orders" description="Min orders for 10 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.totalOrders.1.value" label="3-5 orders" description="Min orders for 30 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.totalOrders.2.value" label="6-10 orders" description="Min orders for 60 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.totalOrders.3.value" label=">10 orders" description="Min orders for 100 pts" />
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">Average Order Value (DKK)</h4>
                                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <ThresholdInput control={form.control} name="thresholds.averageOrderValue.0.value" label="Low Value" description="Min AOV for 10 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.averageOrderValue.1.value" label="Medium Value" description="Min AOV for 50 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.averageOrderValue.2.value" label="High Value" description="Min AOV for 100 pts" />
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">Recency (Days Since Last Order)</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <ThresholdInput control={form.control} name="thresholds.recency.0.value" label="Very Recent" description="Min days for 100 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.recency.1.value" label="Recent" description="Min days for 60 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.recency.2.value" label="Inactive" description="Min days for 30 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.recency.3.value" label="Churned" description="Min days for 0 pts" />
                                    </div>
                                </div>
                                 <Separator />
                                 <div>
                                    <h4 className="font-semibold text-lg mb-2">Frequency (Avg. Days Between Orders)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <ThresholdInput control={form.control} name="thresholds.frequency.0.value" label="Very Frequent" description="Max days for 100 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.frequency.1.value" label="Frequent" description="Max days for 60 pts" />
                                        <ThresholdInput control={form.control} name="thresholds.frequency.2.value" label="Infrequent" description="Max days for 10 pts" />
                                    </div>
                                </div>
                                <Separator />
                                <div>
                                    <h4 className="font-semibold text-lg mb-2">Delivery Method Loyalty Bonus</h4>
                                    <ThresholdInput control={form.control} name="deliveryMethodBonus" label="Bonus Points" description="Points awarded if all orders are of the same type (all delivery or all pickup)." />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
                 <div className="flex justify-end">
                    <Button type="submit" disabled={isPending}>
                        {isPending ? <Loader2 className="animate-spin" /> : 'Save Settings'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
