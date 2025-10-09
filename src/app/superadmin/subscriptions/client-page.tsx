'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { SubscriptionPlan } from '@/types';
import { SubscriptionPlanForm } from '@/components/superadmin/subscription-plan-form';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
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
} from "@/components/ui/alert-dialog"
import { deletePlan } from './actions';
import { useToast } from '@/hooks/use-toast';

interface SubscriptionsClientPageProps {
    initialPlans: SubscriptionPlan[];
}

export function SubscriptionsClientPage({ initialPlans }: SubscriptionsClientPageProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const { toast } = useToast();

  const handleEdit = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedPlan(null);
    setIsFormOpen(true);
  };

  const handleDelete = async (planId: string) => {
    const result = await deletePlan(planId);
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
          <h1 className="text-2xl font-bold tracking-tight">Subscription Plans</h1>
          <p className="text-muted-foreground">
            Manage the subscription packages available to brands.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <PlusCircle className="mr-2" />
          Add New Plan
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan Name</TableHead>
                <TableHead>Monthly Price</TableHead>
                <TableHead>Yearly Price</TableHead>
                <TableHead>Service Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    {plan.name}
                    {plan.isMostPopular && <Badge>Most Popular</Badge>}
                  </TableCell>
                  <TableCell>kr.{plan.priceMonthly}</TableCell>
                  <TableCell>kr.{plan.priceYearly}</TableCell>
                  <TableCell>{plan.serviceFee}%</TableCell>
                  <TableCell>
                    <Badge variant={plan.isActive ? 'default' : 'secondary'}>
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </Badge>
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
                        <DropdownMenuItem onClick={() => handleEdit(plan)}>
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
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the subscription plan. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(plan.id)}>Delete</AlertDialogAction>
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
      <SubscriptionPlanForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        plan={selectedPlan}
      />
    </>
  );
}
