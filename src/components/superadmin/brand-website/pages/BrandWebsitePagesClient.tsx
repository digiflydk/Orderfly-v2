'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { deleteBrandWebsitePage } from '@/lib/superadmin/brand-website/pages-actions';
import { Card, CardContent } from '@/components/ui/card';
import type { BrandWebsitePageSummary } from '@/lib/types/brandWebsite';

interface BrandWebsitePagesClientProps {
  brandId: string;
  initialPages: BrandWebsitePageSummary[];
}

export function BrandWebsitePagesClient({ brandId, initialPages }: BrandWebsitePagesClientProps) {
  const [pages, setPages] = useState(initialPages);
  const [pageToDelete, setPageToDelete] = useState<BrandWebsitePageSummary | null>(null);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!pageToDelete) return;

    try {
      await deleteBrandWebsitePage(brandId, pageToDelete.slug);
      setPages(pages.filter(p => p.slug !== pageToDelete.slug));
      toast({ title: "Success", description: "Page deleted successfully." });
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Error", description: error.message || "Failed to delete page." });
    } finally {
      setPageToDelete(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Sort Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map(page => (
                <TableRow key={page.slug}>
                  <TableCell className="font-medium">{page.title}</TableCell>
                  <TableCell><code className="text-xs bg-muted p-1 rounded-sm">{page.slug}</code></TableCell>
                  <TableCell>{page.sortOrder ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={page.isPublished ? 'default' : 'secondary'}>
                      {page.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/superadmin/brands/${brandId}/website/pages/${page.slug}`}>
                            <Edit className="mr-2 h-4 w-4"/> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setPageToDelete(page)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4"/> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
               {pages.length === 0 && (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No pages created yet.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <AlertDialog open={!!pageToDelete} onOpenChange={(open) => !open && setPageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the page "{pageToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
