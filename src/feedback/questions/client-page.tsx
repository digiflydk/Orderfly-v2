'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { FeedbackQuestionsVersion } from '@/types';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface FeedbackQuestionsClientPageProps {
    initialVersions: FeedbackQuestionsVersion[];
}

export function FeedbackQuestionsClientPage({ initialVersions }: FeedbackQuestionsClientPageProps) {
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
          <div>
              <h1 className="text-2xl font-bold tracking-tight">Feedback Questions</h1>
              <p className="text-muted-foreground">Manage versions of feedback question forms.</p>
          </div>
          <Button asChild>
              <Link href="/superadmin/feedback/questions/new">
                <PlusCircle className="mr-2 h-4 w-4"/>
                New questions
              </Link>
          </Button>
      </div>

      <Card>
        <CardHeader>
            <CardTitle>Question Versions</CardTitle>
            <CardDescription>Only one version per language can be active at a time.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version Label</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Order Types</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialVersions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="font-medium">{version.versionLabel}</TableCell>
                  <TableCell>{version.language.toUpperCase()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                        {version.orderTypes?.map(type => (
                            <Badge key={type} variant="outline" className="capitalize">{type}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>{version.questions.length}</TableCell>
                   <TableCell>
                    <Badge variant={version.isActive ? 'default' : 'secondary'}>
                      {version.isActive ? 'Active' : 'Inactive'}
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
                        <DropdownMenuItem asChild>
                           <Link href={`/superadmin/feedback/questions/edit/${version.id}`}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                           </Link>
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
    </div>
  );
}
