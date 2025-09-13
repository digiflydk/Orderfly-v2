

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
import type { User, Role } from '@/types';
import { createOrUpdateUser, type FormState } from '@/app/superadmin/users/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';

const userSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters.' }),
  email: z.string().email({ message: 'Please enter a valid email address.'}),
  roleIds: z.array(z.string()).optional().default([]),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  user: User | null;
  allRoles: Role[];
}

export function UserForm({ isOpen, setIsOpen, user, allRoles }: UserFormProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      roleIds: [],
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
        roleIds: user.roleIds || [],
      });
    } else {
      form.reset({
        name: '',
        email: '',
        roleIds: [],
      });
    }
  }, [user, form, isOpen]);
  
  const handleFormSubmit = form.handleSubmit((data) => {
    const formData = new FormData();
    if(user?.id) formData.append('id', user.id);
    formData.append('name', data.name);
    formData.append('email', data.email);
    data.roleIds?.forEach(id => formData.append('roleIds', id));

    startTransition(async () => {
        const result = await createOrUpdateUser(null, formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: result.message });
            setIsOpen(false);
        }
    });
  });

  const title = user ? 'Edit User' : 'Create New User';
  const description = user ? `Editing details for ${user.name}.` : 'Fill in the details for the new user.';
  const isEditing = !!user;
  const { formState: { isSubmitting } } = form;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form action={handleFormSubmit} className="space-y-4 py-4">
            {user && <input type="hidden" name="id" value={user.id} />}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john.doe@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleIds"
              render={() => (
                <FormItem>
                  <FormLabel>Roles</FormLabel>
                  <FormDescription>
                    Assign one or more roles to this user.
                  </FormDescription>
                  <ScrollArea className="h-40 rounded-md border">
                    <div className="p-4 space-y-2">
                        {allRoles.map((role) => (
                           <FormField
                           key={role.id}
                           control={form.control}
                           name="roleIds"
                           render={({ field }) => (
                               <FormItem key={role.id} className="flex flex-row items-start space-x-3 space-y-0">
                                   <FormControl>
                                       <Checkbox
                                            value={role.id}
                                            checked={field.value?.includes(role.id)}
                                            onCheckedChange={(checked) => {
                                                const currentValue = field.value || [];
                                                return checked
                                                    ? field.onChange([...currentValue, role.id])
                                                    : field.onChange(currentValue.filter((value) => value !== role.id));
                                            }}
                                       />
                                   </FormControl>
                                   <FormLabel className="font-normal">{role.name}</FormLabel>
                               </FormItem>
                           )}
                           />
                        ))}
                    </div>
                  </ScrollArea>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending || isSubmitting}>
                {(isPending || isSubmitting) ? <Loader2 className="animate-spin" /> : (isEditing ? 'Save Changes' : 'Create User')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
