
'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { User, Role } from '@/types';
import { UserForm } from '@/components/superadmin/user-form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteUser } from './actions';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';

type UserWithRoles = User & { roles: string[] };

interface UsersClientPageProps {
    initialUsers: UserWithRoles[];
    allRoles: Role[];
}

export function UsersClientPage({ initialUsers, allRoles }: UsersClientPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { toast } = useToast();

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedUser(null);
    setIsFormOpen(true);
  };
  
  const handleDelete = async (userId: string) => {
    const result = await deleteUser(userId);
    if(result.error) {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
    } else {
        toast({ title: 'Success!', description: result.message });
    }
  }

  return (
    <>
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Create, view, and manage all users on the platform.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <PlusCircle className="mr-2" />
          Add New User
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map(roleName => (
                        <Badge key={roleName} variant="secondary">{roleName}</Badge>
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
                        <DropdownMenuItem onClick={() => handleEdit(user)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the user.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(user.id)}>Continue</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <UserForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        user={selectedUser}
        allRoles={allRoles}
      />
    </>
  );
}
