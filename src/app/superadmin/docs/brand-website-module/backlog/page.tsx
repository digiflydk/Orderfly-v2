
'use server';

import { requireSuperadmin } from '@/lib/auth/superadmin';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type Status = 'Planned' | 'In progress' | 'Done';

interface Task {
  id: string;
  name: string;
  description: string;
  status: Status;
  dependsOn?: string;
}

interface BacklogCategory {
  title: string;
  tasks: Task[];
}

const backlog: BacklogCategory[] = [
  {
    title: "Header & Template 1 Structure",
    tasks: [
      { id: "522-11-01", name: "Template 1 Page Layout", description: "Create base layout component for Template 1", status: "Done" },
      { id: "522-11-02", name: "Template 1 Header", description: "Implement responsive header with mobile/desktop variants", status: "Done" },
      { id: "522-11-03", name: "Template 1 Footer", description: "Implement footer with CMS-driven columns and links", status: "Planned" },
    ],
  },
  {
    title: "Global Design System",
    tasks: [
      { id: "522-12-01", name: "Color System", description: "Implement CMS controls for primary, secondary, and background colors", status: "Planned" },
      { id: "522-12-02", name: "Typography System", description: "CMS controls for fonts and text sizes (h1, p, etc.)", status: "Planned" },
      { id: "522-12-03", name: "Button System", description: "CMS controls for button shapes and variants", status: "Planned" },
      { id: "522-12-04", name: "Spacing System", description: "CMS controls for section padding and margins", status: "Planned" },
    ],
  },
  {
    title: "Favicon & Metadata",
    tasks: [
        { id: "522-13-01", name: "Dynamic Favicon", description: "Load brand-specific favicon from CMS config", status: "Planned" },
        { id: "522-13-02", name: "Dynamic Page Title", description: "Set page titles based on CMS config for SEO", status: "Planned" },
    ]
  },
  {
    title: "Homepage System",
    tasks: [
      { id: "522-14-01", name: "Hero Section", description: "Implement editable Hero section", status: "Planned" },
      { id: "522-14-02", name: "Feature Section", description: "Implement editable Feature section", status: "Planned" },
      { id: "522-14-03", name: "Services Section", description: "Implement editable Services/icons section", status: "Planned" },
      { id: "522-14-04", name: "AI Project Section", description: "Implement AI chat/lead gen section", status: "Planned" },
      { id: "522-14-05", name: "Cases Section", description: "Implement editable customer cases section", status: "Planned" },
      { id: "522-14-06", name: "About Section", description: "Implement 'About Us' and 'Team' sections", status: "Planned" },
      { id: "522-14-07", name: "Customers Section", description: "Implement customer logo carousel", status: "Planned" },
      { id: "522-14-08", name: "Contact Section", description: "Implement contact form section", status: "Planned" },
      { id: "522-14-09", name: "Homepage Section Order", description: "Allow drag-and-drop reordering of all sections", status: "Planned" },
    ],
  },
   {
    title: "Testing",
    tasks: [
      { id: "522-90-01", name: "Acceptance Test Suite", description: "Create end-to-end tests for all public APIs", status: "Planned" },
      { id: "522-90-02", name: "QA Testcase Runner", description: "Build a QA runner for manual test execution", status: "Planned" },
    ],
  },
];

const statusVariantMap: Record<Status, VariantProps<typeof Badge>['variant']> = {
  'Planned': 'secondary',
  'In progress': 'default',
  'Done': 'outline',
};

const statusDotClassMap: Record<Status, string> = {
    'Planned': 'bg-gray-400',
    'In progress': 'bg-blue-500 animate-pulse',
    'Done': 'bg-green-500',
}

function BacklogTable({ category }: { category: BacklogCategory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{category.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[150px]">Depends On</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {category.tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-mono text-xs">{task.id}</TableCell>
                <TableCell className="font-medium">{task.name}</TableCell>
                <TableCell className="text-muted-foreground">{task.description}</TableCell>
                <TableCell className="font-mono text-xs">{task.dependsOn || '—'}</TableCell>
                <TableCell>
                  <Badge variant={statusVariantMap[task.status]}>
                     <div className={cn("h-2 w-2 rounded-full mr-2", statusDotClassMap[task.status])}/>
                    {task.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function BrandWebsiteBacklogPage() {
    await requireSuperadmin();

    return (
        <DocsLayout
            sidebar={<DocsNav docs={DEV_DOCS} utilities={DEV_UTILITIES} activeDocId="brand-website-backlog" />}
        >
            <div className="space-y-8">
                <section>
                    <h1 className="text-2xl font-semibold mb-2">Brand Website Module - Project Backlog</h1>
                    <p className="text-sm text-muted-foreground">
                        A complete overview of all tasks for building the Brand Website module.
                    </p>
                </section>

                <div className="space-y-6">
                    {backlog.map(category => (
                        <BacklogTable key={category.title} category={category} />
                    ))}
                </div>
            </div>
        </DocsLayout>
    );
}

