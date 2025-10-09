
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { Role } from '@/types';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteRole } from './actions';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface RolesClientPageProps {
    initialRoles: Role[];
}

export function RolesClientPage({ initialRoles }: RolesClientPageProps) {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const { toast } = useToast();

  const confirmDelete = (roleId: string) => {
    setRoleToDelete(roleId);
    setIsAlertOpen(true);
  }
  
  const handleDelete = async () => {
    if (!roleToDelete) return;
    const result = await deleteRole(roleToDelete);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
    setIsAlertOpen(false);
    setRoleToDelete(null);
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Role Management</h1>
          <p className="text-muted-foreground">
            Create and manage user roles and their permissions.
          </p>
        </div>
        <Button asChild>
          <Link href="/superadmin/roles/new">
            <PlusCircle className="mr-2" />
            Add New Role
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialRoles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">{role.name}</TableCell>
                   <TableCell className="max-w-md">
                    <div className="flex flex-wrap gap-1">
                        {role.permissions?.map(permission => (
                            <Badge key={permission} variant="secondary">{permission}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/roles/edit/${role.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} onClick={() => confirmDelete(role.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the role.
                    Ensure no users are assigned this role before deleting.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
