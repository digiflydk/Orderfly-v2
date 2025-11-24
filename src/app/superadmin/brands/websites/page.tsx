
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';
import { getBrands } from '@/app/superadmin/brands/actions';
import type { Brand } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Edit, Globe } from 'lucide-react';

async function BrandWebsitesOverviewContent() {
  const brands = await getBrands();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brand Websites Overview</h1>
        <p className="text-muted-foreground">
          Manage and overview all public-facing brand websites.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Primary Domain</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.map(brand => {
                // Safely access nested optional properties from `appearances` which holds website config
                const isActive = false; // Placeholder as `active` is not in `appearances`
                const primaryDomain = "example.com"

                return (
                  <TableRow key={brand.id}>
                    <TableCell className="font-medium">{brand.name}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? 'default' : 'secondary'}>
                        {isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {primaryDomain ? (
                        <code className="text-xs bg-muted p-1 rounded-sm">{primaryDomain}</code>
                      ) : (
                        <span className="text-sm text-muted-foreground">No domain configured</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                         <Button asChild variant="outline" size="sm">
                           <Link href={`/superadmin/brands/${brand.id}/website`}>
                             <Edit className="mr-2 h-4 w-4"/>
                             Edit Website
                           </Link>
                         </Button>
                         {primaryDomain && isActive && (
                           <Button asChild variant="secondary" size="sm">
                             <Link href={`https://${primaryDomain}`} target="_blank" rel="noopener noreferrer">
                               <Globe className="mr-2 h-4 w-4"/>
                               View Site
                             </Link>
                           </Button>
                         )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function BrandWebsitesPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <BrandWebsitesOverviewContent />;
}
