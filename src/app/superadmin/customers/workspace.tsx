'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CustomerListRow } from '@/lib/customers/list-view';
import type { DirectoryEntry } from '@/lib/customers/directory';
import { CustomersClientPage } from './client-page';
import { CustomersDirectory } from './directory-client';

export function CustomersWorkspace({ customers, brands, entries, brandNames, global }: {
  customers: CustomerListRow[];
  brands: Array<{ id: string; name: string }>;
  entries: DirectoryEntry[];
  brandNames: Record<string, string>;
  global: boolean;
}) {
  return <Tabs defaultValue="records" className="space-y-4">
    <TabsList aria-label="Customer view">
      <TabsTrigger value="records">Customer records</TabsTrigger>
      <TabsTrigger value="directory">Unified directory</TabsTrigger>
    </TabsList>
    <TabsContent value="records"><CustomersClientPage initialCustomers={customers} brands={brands} entries={entries} brandNames={brandNames} /></TabsContent>
    <TabsContent value="directory"><CustomersDirectory entries={entries} brandNames={brandNames} global={global} /></TabsContent>
  </Tabs>;
}
