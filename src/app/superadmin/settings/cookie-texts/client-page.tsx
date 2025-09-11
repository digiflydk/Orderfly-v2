

'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, MoreHorizontal, Edit, Trash2 } from "lucide-react";
import type { CookieTexts, Brand } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Link from 'next/link';

type CookieTextsWithBrand = CookieTexts & { brandName?: string };

interface CookieTextsClientPageProps {
    initialTexts: CookieTexts[];
    brands: Brand[];
}

export function CookieTextsClientPage({ initialTexts, brands }: CookieTextsClientPageProps) {
  const brandMap = new Map(brands.map(b => [b.id, b.name]));

  const textsWithBrands: CookieTextsWithBrand[] = initialTexts.map(text => ({
    ...text,
    brandName: text.brand_id ? brandMap.get(text.brand_id) : undefined,
  }));

  return (
    <>
      <div className="flex items-center justify-end">
        <Button asChild>
          <Link href="/superadmin/settings/cookie-texts/new">
            <PlusCircle className="mr-2" />
            Add new text
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {textsWithBrands.map((text) => (
                <TableRow key={text.id}>
                  <TableCell className="font-medium">{text.consent_version}</TableCell>
                  <TableCell>{text.language.toUpperCase()}</TableCell>
                  <TableCell>
                    {text.brandName ? (
                      <Badge variant="secondary">{text.brandName}</Badge>
                    ) : (
                      <Badge variant="outline">Global</Badge>
                    )}
                  </TableCell>
                  <TableCell>{format(new Date(text.last_updated), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                     <Button variant="ghost" size="icon" asChild>
                        <Link href={`/superadmin/settings/cookie-texts/edit/${text.id}`}>
                           <Edit className="h-4 w-4" />
                        </Link>
                     </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

