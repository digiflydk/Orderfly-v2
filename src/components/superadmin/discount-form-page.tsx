'use client';
import { getDiscountCustomers, getNewsletterSetup } from '@/app/superadmin/discounts/actions';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { useState, useEffect, useMemo, useTransition } from 'react';
import Link from '@/components/superadmin/admin-link';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { calendarDay, calendarDate, promotionDay } from '@/lib/promotion-calendar';
import { CalendarIcon, Loader2, PlusCircle, Trash2, Clock } from 'lucide-react';

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
import { Switch } from '@/components/ui/switch';
import type { Discount, Brand, Location } from '@/types';
import { createOrUpdateDiscount } from '@/app/superadmin/discounts/actions';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { discountFormRecord } from '@/lib/legacy-promotion-form';
import { Separator } from '../ui/separator';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';

const activeTimeSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
});

const discountSchema = z.object({
  id: z.string().optional(),
  brandId: z.string().min(1, 'A brand must be selected.'),
  locationIds: z.array(z.string()).min(1, 'At least one location must be selected.'),
  applicationType: z.enum(['code', 'newsletter_signup']).default('code'),
  code: z.string().transform(v => v.trim().toUpperCase()),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.coerce.number().positive('Discount value must be positive.'),
  minOrderValue: z.coerce.number().min(0).optional(),
  isActive: z.boolean().default(true),
  orderTypes: z
    .array(z.enum(['pickup', 'delivery']))
    .min(1, 'At least one order type must be selected.'),
  activeDays: z.array(z.string()).optional().default([]),
  activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  usageLimit: z.coerce.number().min(0, 'Usage limit must be 0 or more.'),
  perCustomerLimit: z.coerce.number().min(0, 'Per customer limit must be 0 or more.'),
  assignedToCustomerId: z.string().optional(),
  firstTimeCustomerOnly: z.boolean().default(false),
  allowStacking: z.boolean().default(false),
}).superRefine((data, ctx) => {
  if (data.applicationType === 'code' && data.code === 'NEWSLETTER_SIGNUP') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['code'], message: 'Indtast en rabatkode. NEWSLETTER_SIGNUP er reserveret til nyhedsbrevsrabatter.' });
  }
  if (data.applicationType === 'code' && data.code.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['code'],
      message: 'Code must be at least 3 characters.',
    });
  }
});

type DiscountFormValues = z.infer<typeof discountSchema>;

interface DiscountFormPageProps {
  discount?: Discount;
  brands: Brand[];
  locations: Location[];

}

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function DiscountFormPage({
  discount,
  brands,
  locations,

}: DiscountFormPageProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<DiscountFormValues>({
    resolver: zodResolver(discountSchema) as any,
    defaultValues: (discount
      ? {
          ...discountFormRecord(discount),
          startDate: discount.startDate
            ? promotionDay(discount.startDate)
            : undefined,
          endDate: discount.endDate
            ? promotionDay(discount.endDate)
            : undefined,
          minOrderValue: discount.minOrderValue ?? 0,
          assignedToCustomerId: discount.assignedToCustomerId ?? undefined,
        }
      : {
          brandId: '',
          locationIds: [],
          applicationType: 'code',
          code: '',
          description: '',
          discountType: 'percentage',
          discountValue: 0,
          minOrderValue: 0,
          isActive: true,
          orderTypes: ['pickup', 'delivery'],
          activeDays: WEEKDAYS,
          activeTimeSlots: [{ start: '00:00', end: '23:59' }],
          usageLimit: 0,
          perCustomerLimit: 1,
          firstTimeCustomerOnly: false,
          allowStacking: false,
        }) as any,
  });

  const { control, watch, setValue, reset } = form;

  const {
    fields: timeSlotFields,
    append: appendTimeSlot,
    remove: removeTimeSlot,
  } = useFieldArray({
    control,
    name: 'activeTimeSlots',
  });

  useEffect(() => {
    if (discount) {
      reset({
        ...discountFormRecord(discount),
        startDate: discount.startDate
          ? promotionDay(discount.startDate)
          : undefined,
        endDate: discount.endDate
          ? promotionDay(discount.endDate)
          : undefined,
        minOrderValue: discount.minOrderValue ?? undefined,
        assignedToCustomerId: discount.assignedToCustomerId ?? undefined,
      } as any);
    }
  }, [discount, reset]);

  const selectedBrandId = watch('brandId');
  const [customers, setCustomers] = useState<{id: string; name: string; email: string}[]>([]);
  useEffect(() => {
    let current = true;
    setCustomers([]);
    void getDiscountCustomers(selectedBrandId).then(rows => { if (current) setCustomers(rows); });
    return () => { current = false; };
  }, [selectedBrandId]);
  const assignedToCustomerId = watch('assignedToCustomerId');
  const firstTimeCustomerOnly = watch('firstTimeCustomerOnly');
  const applicationType = watch('applicationType');
  const [newsletterSetup, setNewsletterSetup] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setNewsletterSetup(null);
    if (applicationType === 'newsletter_signup' && selectedBrandId) {
      void getNewsletterSetup(selectedBrandId).then(message => {
        if (current) setNewsletterSetup(message);
      }).catch(() => { if (current) setNewsletterSetup('Opsætningen kunne ikke kontrolleres. Prøv igen, eller kontakt en administrator.'); });
    }
    return () => { current = false; };
  }, [applicationType, selectedBrandId]);


  useEffect(() => {
    if (applicationType === 'newsletter_signup') {
      setValue('code', 'NEWSLETTER_SIGNUP', { shouldValidate: true });
    }
  }, [applicationType, setValue]);

  const availableLocations = useMemo(() => {
    if (!selectedBrandId) return [];
    return locations.filter(l => l.brandId === selectedBrandId);
  }, [selectedBrandId, locations]);
  const previousLocationIds = useMemo(() =>
    (discount ? discountFormRecord(discount).locationIds : []).filter(id =>
      !locations.some(location => location.id === id && location.brandId === discount?.brandId)),
    [discount, locations]);

  const title = discount ? 'Edit Discount' : 'Create New Discount';
  const description = discount
    ? `Editing details for ${discount.code}.`
    : 'Fill in the details for the new discount.';

  const [saveError, setSaveError] = useState<string | null>(null);
  const handleFormSubmit = form.handleSubmit(data => {
    setSaveError(null);
    const formData = new FormData();

    Object.entries(data).forEach(([key, value]) => {
      if (key === 'activeTimeSlots' || value === undefined || value === null) return;

      if (Array.isArray(value)) {
        value.forEach(item => formData.append(key, String(item)));
      } else {
        formData.append(key, String(value));
      }
    });

    formData.append('activeTimeSlots', JSON.stringify(data.activeTimeSlots));
    if (discount?.startDate && !data.startDate) formData.set('clearStartDate', 'true');
    if (discount?.endDate && !data.endDate) formData.set('clearEndDate', 'true');

    startTransition(async () => {
      const result = await (createOrUpdateDiscount as any)(null, formData);

      if (result?.error) {
        setSaveError(result.message);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
        });

        if (result.errors) {
          result.errors.forEach((error: any) => {
            form.setError(error.path.join('.') as any, {
              message: error.message,
            });
          });
        }
      } else if (result?.message) {
        toast({
          title: 'Success!',
          description: result.message,
        });
      }
    });
  }, errors => {
    const messages = Object.entries(errors).map(([field, error]) => `${field}: ${error?.message || 'Kontrollér feltet'}`);
    setSaveError(`Rabatten blev ikke gemt. ${messages.join('. ')}`);
  });

  return (
    <Form {...(form as any)}>
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {newsletterSetup && <p role="status" className="rounded-md border border-amber-500 p-3">{newsletterSetup}</p>}
        {saveError && <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">{saveError}</p>}
        {discount?.id && <input type="hidden" name="id" value={discount.id} />}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/superadmin/discounts">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : discount ? (
                'Save Changes'
              ) : (
                'Create Discount'
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Core Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={control as any}
                  name="applicationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How the discount is applied</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="code">Customer enters a discount code</SelectItem>
                          <SelectItem value="newsletter_signup">Automatic on newsletter signup</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Newsletter discounts use these same value, location and availability rules.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {applicationType === 'newsletter_signup' && (
                  <FormField
                    control={control as any}
                    name="allowStacking"
                    render={({ field }) => (
                      <FormItem className="flex items-start justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-1">
                          <FormLabel>Tillad rabatstabling på nyhedsbrevsrabatten</FormLabel>
                          <FormDescription>
                            Giv rabat på alle varer efter varerabatter, inklusive tilvalg og menuer.
                            Pose, levering og gebyrer er ikke med. Når valget er slået fra,
                            gælder rabatten kun varer uden anden rabat.
                            <span className="block mt-1">Andre kurvrabatter kombineres ikke. Den bedste kurvrabat bruges.</span>
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch name="allowStacking" checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={control as any}
                  name="brandId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        defaultValue={field.value}
                        disabled={!!discount}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a brand" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brands.map(b => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control as any}
                  name="locationIds"
                  render={() => (
                    <FormItem>
                      <FormLabel>Locations</FormLabel>
                      {previousLocationIds.length > 0 && (
                        <FormDescription>
                          Tidligere butik findes ikke længere. Den gemte tilknytning bevares ved gemning,
                          men rabatten gælder ikke i en nuværende butik, før du vælger en ny.
                        </FormDescription>
                      )}
                      <ScrollArea className="h-40 rounded-md border">
                        <div className="p-4">
                          {previousLocationIds.map(id => (
                            <FormField key={id} control={control as any} name="locationIds" render={({ field }) => (
                              <FormItem className="mb-2 flex flex-row items-start space-x-3 space-y-0">
                                <FormControl><Checkbox checked={(field.value || []).includes(id)}
                                  onCheckedChange={checked => field.onChange(checked
                                    ? [...(field.value || []), id]
                                    : (field.value || []).filter((value: string) => value !== id))} /></FormControl>
                                <FormLabel className="font-normal">Tidligere butik ({id})</FormLabel>
                              </FormItem>
                            )} />
                          ))}
                          {availableLocations.map(item => (
                            <FormField
                              key={item.id}
                              control={control as any}
                              name="locationIds"
                              render={({ field }) => {
                                const currentValue: string[] = field.value ?? [];
                                return (
                                  <FormItem className="mb-2 flex flex-row items-start space-x-3 space-y-0">
                                    <FormControl>
                                      <Checkbox
                                        name={field.name}
                                        checked={currentValue.includes(item.id)}
                                        onCheckedChange={checked =>
                                          checked
                                            ? field.onChange([
                                                ...currentValue,
                                                item.id,
                                              ])
                                            : field.onChange(
                                                currentValue.filter(
                                                  (value: string) =>
                                                    value !== item.id,
                                                ),
                                              )
                                        }
                                      />
                                    </FormControl>
                                    <FormLabel className="font-normal">
                                      {item.name}
                                    </FormLabel>
                                  </FormItem>
                                );
                              }}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                {applicationType === 'code' && (
                  <FormField
                    control={control as any}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Code</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., SUMMER10" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={control as any}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Admin only)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Internal description for this discount."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Discount Value & Rules</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={control as any}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                            <SelectItem value="fixed_amount">
                              Fixed Amount (DKK)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control as any}
                    name="discountValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Value</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="e.g. 10 or 50"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={control as any}
                  name="minOrderValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Order Value (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 200"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        De rabatberettigede varer skal koste mindst dette beløb.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Restrictions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={control as any}
                  name="assignedToCustomerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specific Customer (Optional)</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ''}
                        disabled={firstTimeCustomerOnly}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} ({u.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        If set, only this customer can use the code.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control as any}
                  name="firstTimeCustomerOnly"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>First-Time Customers Only</FormLabel>
                        <FormDescription>
                          Can only be used if the customer has no previous orders.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          name="firstTimeCustomerOnly"
                          checked={field.value}
                          onCheckedChange={val => {
                            if (val) setValue('assignedToCustomerId', undefined);
                            field.onChange(val);
                          }}
                          disabled={!!assignedToCustomerId}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={control as any}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Active</FormLabel>
                      </div>
                      <FormControl>
                        <Switch
                          name="isActive"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={control as any}
                  name="usageLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Usage Limit</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="100" {...field} />
                      </FormControl>
                      <FormDescription>0 for unlimited.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control as any}
                  name="perCustomerLimit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Per Customer Limit</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="1" {...field} />
                      </FormControl>
                      <FormDescription>0 for unlimited.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <FormField
                  control={control as any}
                  name="orderTypes"
                  render={() => (
                    <FormItem>
                      <FormLabel>Order Type Availability</FormLabel>
                      <div className="flex gap-4 pt-2">
                        <FormField
                          control={control as any}
                          name="orderTypes"
                          render={({ field }) => {
                            const current: string[] = field.value ?? [];
                            return (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Checkbox
                                    name={field.name}
                                    checked={current.includes('pickup')}
                                    onCheckedChange={checked =>
                                      checked
                                        ? field.onChange([...current, 'pickup'])
                                        : field.onChange(
                                            current.filter(
                                              (v: string) => v !== 'pickup',
                                            ),
                                          )
                                    }
                                  />
                                </FormControl>
                                <FormLabel className="font-normal capitalize">
                                  Pickup
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                        <FormField
                          control={control as any}
                          name="orderTypes"
                          render={({ field }) => {
                            const current: string[] = field.value ?? [];
                            return (
                              <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                  <Checkbox
                                    name={field.name}
                                    checked={current.includes('delivery')}
                                    onCheckedChange={checked =>
                                      checked
                                        ? field.onChange([...current, 'delivery'])
                                        : field.onChange(
                                            current.filter(
                                              (v: string) => v !== 'delivery',
                                            ),
                                          )
                                    }
                                  />
                                </FormControl>
                                <FormLabel className="font-normal capitalize">
                                  Delivery
                                </FormLabel>
                              </FormItem>
                            );
                          }}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Date & Time Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={control as any}
                  name="activeDays"
                  render={() => (
                    <FormItem>
                      <FormLabel>Active Weekdays</FormLabel>
                      <div className="grid grid-cols-3 gap-2 pt-2 sm:grid-cols-4">
                        {WEEKDAYS.map(day => (
                          <FormField
                            key={day}
                            control={control as any}
                            name="activeDays"
                            render={({ field }) => {
                              const current: string[] = field.value ?? [];
                              return (
                                <FormItem className="flex items-center space-x-2">
                                  <FormControl>
                                    <Checkbox
                                      name={field.name}
                                      checked={current.includes(day)}
                                      onCheckedChange={checked =>
                                        checked
                                          ? field.onChange([...current, day])
                                          : field.onChange(
                                              current.filter(
                                                (v: string) => v !== day,
                                              ),
                                            )
                                      }
                                    />
                                  </FormControl>
                                  <FormLabel className="text-sm font-normal capitalize">
                                    {day}
                                  </FormLabel>
                                </FormItem>
                              );
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-2">
                  <FormLabel>Active Time Slots</FormLabel>
                  {timeSlotFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <FormField
                        control={control as any}
                        name={`activeTimeSlots.${index}.start`}
                        render={({ field: timeField }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input type="time" {...timeField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <span>-</span>
                      <FormField
                        control={control as any}
                        name={`activeTimeSlots.${index}.end`}
                        render={({ field: timeField }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input type="time" {...timeField} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeTimeSlot(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      appendTimeSlot({ start: '00:00', end: '23:59' })
                    }
                  >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Time Slot
                  </Button>
                </div>

                <Separator />

                <FormField
                  control={control as any}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Startdato</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(calendarDate(field.value)!, 'PPP', { locale: da })
                              ) : (
                                <span>Vælg dato</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0"
                          align="start"
                        >
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? calendarDate(field.value) : undefined
                            }
                            onSelect={date =>
                              field.onChange(
                                calendarDay(date),
                              )
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control as any}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Slutdato</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(calendarDate(field.value)!, 'PPP', { locale: da })
                              ) : (
                                <span>Vælg dato</span>
                              )}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0"
                          align="start"
                        >
                          <Calendar
                            mode="single"
                            selected={
                              field.value ? calendarDate(field.value) : undefined
                            }
                            onSelect={date =>
                              field.onChange(
                                calendarDay(date),
                              )
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
