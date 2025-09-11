
'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  saveCustomerAction,
  deleteCustomerAction,
  getCustomersAction,
} from '@/app/superadmin/website/actions';
import type { Customer } from '@/types/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Trash2, PlusCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import CmsLayout from '../_cmsLayout';

const customerFormSchema = z.object({
  name: z.string().min(1, 'Navn er påkrævet'),
  logoUrl: z.string().url('Ugyldig URL'),
  aiHint: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

function CmsCustomersPageContent() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, startTransition] = useTransition();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: '',
      logoUrl: '',
      aiHint: '',
    },
  });

  useEffect(() => {
    async function loadCustomers() {
      setIsLoading(true);
      const loadedCustomers = await getCustomersAction();
      setCustomers(loadedCustomers);
      setIsLoading(false);
    }
    loadCustomers();
  }, []);

  const onSubmit = (data: CustomerFormValues) => {
    startTransition(async () => {
      const payload: Omit<Customer, 'id'> = { ...data, aiHint: data.aiHint ?? '' };
      const result = await saveCustomerAction(payload);
      toast({
        title: result.success ? 'Succes!' : 'Fejl!',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        setCustomers(result.customers);
        form.reset();
        setIsDialogOpen(false);
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteCustomerAction(id);
       toast({
        title: result.success ? 'Succes!' : 'Fejl!',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
      if (result.success) {
        setCustomers(result.customers);
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kunder</h1>
          <p className="text-muted-foreground">
            Administrer logoer for de kunder, der skal vises på din hjemmeside.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
             <Button onClick={() => form.reset()}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Tilføj Ny Kunde
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Tilføj Ny Kunde</DialogTitle>
            </DialogHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Kundenavn</FormLabel>
                                <FormControl>
                                    <Input placeholder="F.eks. Google" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="logoUrl"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Logo URL</FormLabel>
                                <FormControl>
                                    <Input placeholder="https://..." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                      <FormField
                        control={form.control}
                        name="aiHint"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>AI Billede Hint (valgfrit)</FormLabel>
                                <FormControl>
                                    <Input placeholder="F.eks. tech company" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <div className="flex justify-end gap-2">
                         <DialogClose asChild>
                            <Button type="button" variant="secondary">Annuller</Button>
                         </DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Gem Kunde
                        </Button>
                    </div>
                </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Eksisterende Kunder</CardTitle>
                <CardDescription>Disse logoer vises i karrusellen på forsiden.</CardDescription>
            </CardHeader>
            <CardContent>
                  {isLoading ? (
                    <div className="flex justify-center items-center h-48">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : customers.length > 0 ? (
                     <div className="space-y-4">
                        {customers.map((customer) => (
                           <div key={customer.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                             <div className="flex items-center gap-4">
                               <div className="relative w-24 h-12 bg-white rounded-md flex items-center justify-center p-1">
                                    <Image
                                        src={customer.logoUrl}
                                        alt={customer.name}
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                                <h3 className="font-semibold">{customer.name}</h3>
                             </div>
                             <Button
                                variant="destructive"
                                size="icon"
                                onClick={() => handleDelete(customer.id)}
                                disabled={isSubmitting}
                                className="h-8 w-8"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                           </div>
                        ))}
                    </div>
                ) : (
                      <Alert>
                        <AlertTitle>Ingen kunder tilføjet</AlertTitle>
                        <AlertDescription>
                            Der er endnu ikke tilføjet nogle kundelogoer. Klik på "Tilføj Ny Kunde" for at oprette en.
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

export default function CmsCustomersPage() {
    return (
        <CmsLayout>
            <CmsCustomersPageContent />
        </CmsLayout>
    )
}
