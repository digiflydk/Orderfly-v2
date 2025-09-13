

'use client';

import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { Role } from '@/types';
import { createOrUpdateRole, type FormState } from '@/app/superadmin/roles/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { groupBy } from 'lodash';

const roleSchema = z.object({
  name: z.string().min(2, { message: 'Role name must be at least 2 characters.' }),
  description: z.string().optional(),
  permissions: z.array(z.string()).min(1, 'At least one permission must be selected.'),
});

type RoleFormValues = z.infer<typeof roleSchema>;

interface RoleFormPageProps {
  role?: Role;
}

export function RoleFormPage({ role }: RoleFormPageProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    defaultValues: role || {
      name: '',
      description: '',
      permissions: [],
    },
  });

  const onSubmit = (data: RoleFormValues) => {
    const formData = new FormData();
    if (role?.id) {
        formData.append('id', role.id);
    }
    formData.append('name', data.name);
    if(data.description) formData.append('description', data.description);
    data.permissions.forEach(p => formData.append('permissions', p));

    startTransition(async () => {
        const result = await createOrUpdateRole(null, formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success!', description: `Role ${role ? 'updated' : 'created'}.` });
        }
    });
  };

  const title = role ? 'Edit Role' : 'Create New Role';
  const description = role ? `Editing details for the ${role.name} role.` : 'Fill in the details for the new role.';
  
  const groupedPermissions = groupBy(ALL_PERMISSIONS, 'group');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{description}</p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" asChild>
                    <Link href="/superadmin/roles">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isPending}>
                    {isPending ? <Loader2 className="animate-spin" /> : (role ? 'Save Changes' : 'Create Role')}
                </Button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 h-fit">
                <CardHeader>
                    <CardTitle>Role Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {role && <input type="hidden" name="id" value={role.id} />}
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Role Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., Brand Manager" {...field} />
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
                                    <Textarea placeholder="A short description of this role's purpose." {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>

            <Card className="lg:col-span-2">
                <CardHeader>
                    <CardTitle>Permissions</CardTitle>
                    <CardDescription>Select the permissions this role should have.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormField
                        control={form.control}
                        name="permissions"
                        render={({ field }) => (
                            <FormItem>
                                <div className="space-y-4">
                                {Object.entries(groupedPermissions).map(([groupName, permissions]) => {
                                    const groupPermissionIds = permissions.map(p => p.id);
                                    const areAllSelected = groupPermissionIds.every(id => field.value?.includes(id));
                                    
                                    const handleSelectAll = (checked: boolean | string) => {
                                        const currentPermissions = new Set(field.value || []);
                                        if (checked) {
                                            groupPermissionIds.forEach(id => currentPermissions.add(id));
                                        } else {
                                            groupPermissionIds.forEach(id => currentPermissions.delete(id));
                                        }
                                        field.onChange(Array.from(currentPermissions));
                                    };

                                    return (
                                    <div key={groupName}>
                                        <div className="flex items-center justify-between mb-2 border-b pb-2">
                                            <h3 className="text-lg font-semibold">{groupName}</h3>
                                            <div className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`select-all-${groupName}`}
                                                    checked={areAllSelected}
                                                    onCheckedChange={handleSelectAll}
                                                />
                                                <label
                                                    htmlFor={`select-all-${groupName}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                    Select All
                                                </label>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {permissions.map((permission) => (
                                                <FormField
                                                key={permission.id}
                                                control={form.control}
                                                name="permissions"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value?.includes(permission.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const currentValue = field.value || [];
                                                                    return checked
                                                                        ? field.onChange([...currentValue, permission.id])
                                                                        : field.onChange(currentValue.filter((value) => value !== permission.id));
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <div className="space-y-1 leading-none">
                                                            <FormLabel className="font-normal cursor-pointer">{permission.name}</FormLabel>
                                                            <FormDescription className="cursor-pointer">{permission.description}</FormDescription>
                                                        </div>
                                                    </FormItem>
                                                )}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )})}
                                </div>
                                <FormMessage className="mt-4" />
                            </FormItem>
                        )}
                    />
                </CardContent>
            </Card>
        </div>
      </form>
    </Form>
  );
}
