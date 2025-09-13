

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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FoodCategory } from '@/types';
import { createOrUpdateFoodCategory, type FormState } from '@/app/superadmin/food-categories/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const foodCategorySchema = z.object({
  name: z.string().min(2, { message: 'Category name must be at least 2 characters.' }),
  description: z.string().optional(),
});

type FoodCategoryFormValues = z.infer<typeof foodCategorySchema>;

interface FoodCategoryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  category: FoodCategory | null;
}

export function FoodCategoryForm({ isOpen, setIsOpen, category }: FoodCategoryFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FoodCategoryFormValues>({
    resolver: zodResolver(foodCategorySchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        description: category.description || '',
      });
    } else {
      form.reset({
        name: '',
        description: '',
      });
    }
  }, [category, form, isOpen]);

  const handleFormSubmit = form.handleSubmit((data) => {
    const formData = new FormData();
    if(category?.id) formData.append('id', category.id);
    formData.append('name', data.name);
    if(data.description) formData.append('description', data.description);
    
    startTransition(async () => {
        const result = await createOrUpdateFoodCategory(null, formData);
        if (result.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
            setIsOpen(false);
        }
    });
  });

  const title = category ? 'Edit Food Category' : 'Create New Food Category';
  const description = category ? `Editing details for ${category.name}.` : 'Fill in the details for the new food category.';
  const isEditing = !!category;
  const { formState: { isSubmitting } } = form;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleFormSubmit} className="space-y-4">
             <div className="space-y-4 px-6">
                {category && <input type="hidden" name="id" value={category.id} />}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Pizzeria, Burgers, Thai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="A short description of this food category." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
             </div>
            <DialogFooter className="bg-muted px-6 py-4">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
               <Button type="submit" disabled={isPending || isSubmitting}>
                    {(isPending || isSubmitting) ? <Loader2 className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create Category')}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
