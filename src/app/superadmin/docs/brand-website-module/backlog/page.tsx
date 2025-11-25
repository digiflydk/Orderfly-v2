
'use server';

import { requireSuperadmin } from '@/lib/auth/superadmin';
import DocsLayout from '@/components/superadmin/docs/DocsLayout';
import DocsNav from '@/components/superadmin/docs/DocsNav';
import { DEV_DOCS, DEV_UTILITIES } from '@/lib/superadmin/docs-config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

type Status = 'Planned' | 'In Progress' | 'Done';

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
      { id: "522-11-01", name: "Template 1 Page Layout", description: "Create base layout wrapper component for Template 1", status: "Done" },
      { id: "522-11-02", name: "Template 1 Header", description: "Implement responsive Template 1 header with desktop/mobile variants", status: "Done" },
      { id: "522-11-03", name: "Header from Brand Config", description: "Bind Template 1 Header to Brand + Website Config via public API (Esmeralda)", status: "Done" },
      { id: "522-11-04", name: "Template 1 Page + Esmeralda Preview", description: "Introduce Template1Page layout component and use it for the Esmeralda preview route", status: "Done" },
      { id: "522-11-05", name: "Template 1 Footer", description: "Implement Template 1 footer with CMS-driven columns and links", status: "Planned" },
    ],
  },
  {
    title: "Global Design System",
    tasks: [
      { id: "522-11-20", name: "Color System", description: "Implement CMS controls and design tokens for primary, secondary, and background colors", status: "Done" },
      { id: "522-11-21", name: "Typography System", description: "CMS controls and tokens for fonts, font sizes, and text styles (headings, body, labels)", status: "Done" },
      { id: "522-11-22", name: "Button System", description: "CMS-driven button styles (shape, radius, variants) wired into Template 1 components", status: "Done" },
      { id: "522-11-23", name: "Spacing System", description: "Define spacing scale for sections and paddings, and expose CMS knobs where needed", status: "Done" },
      { id: "522-11-24", name: "Theme Modes (Optional)", description: "Optional support for light/dark theme modes for Template 1", status: "Planned" },
    ],
  },
   {
    title: "Favicon & Metadata",
    tasks: [
        { id: "522-11-30", name: "Favicon System", description: "Load brand-specific favicon from Website Config and inject into the document head", status: "Done" },
        { id: "522-11-31", name: "Metadata & SEO System", description: "Set page titles and meta descriptions based on Website Config for SEO", status: "In Progress" },
        { id: "522-11-32", name: "Social Open Graph", description: "Configure Open Graph image, title and description for social sharing", status: "In Progress" },
    ]
  },
  {
    title: "Homepage System (Template 1)",
    tasks: [
      { id: "522-11-06", name: "Homepage CMS Editor", description: "Create CMS editor for managing Template 1 homepage sections for a brand", status: "Planned" },
      { id: "522-11-07", name: "Homepage Schema", description: "Define Zod schema for homepage sections (Hero, Promo, CTADeck, MenuGrid, etc.)", status: "Planned" },
      { id: "522-11-08", name: "Homepage Public API", description: "Expose a public API that returns fully resolved Homepage data for Template 1", status: "Planned" },
      { id: "522-11-09", name: "Hero Section", description: "Implement Template 1 Hero section with title, subtitle, image(s) and CTA", status: "Planned" },
      { id: "522-11-10", name: "PromoBanner Section", description: "Implement top/bottom promo banner with CMS-controlled text and styling", status: "Planned" },
      { id: "522-11-11", name: "CTADeck Section", description: "Implement a deck of CTAs (e.g. Delivery, Pickup, Reservation) for the homepage", status: "Planned" },
      { id: "522-11-12", name: "MenuGrid Section", description: "Implement Template 1 MenuGrid section that links to the brand’s menu configuration", status: "Planned" },
      { id: "522-11-13", name: "Footer CTA Section", description: "Implement a footer CTA strip for ordering / contact", status: "Planned" },
      { id: "522-11-14", name: "Mobile Homepage UX", description: "Polish mobile scrolling, sticky elements and section spacing for the homepage", status: "Planned" },
      { id: "522-11-15", name: "Multi-Section Structure", description: "Enable composing multiple sections into a single homepage config", status: "Planned" },
      { id: "522-11-16", name: "Section Sorting", description: "Allow drag-and-drop reordering of homepage sections in the CMS", status: "Planned" },
      { id: "522-11-18", name: "Template 1 Homepage Final Polish", description: "Visual and UX polish pass on Template 1 homepage", status: "Planned" },
      { id: "522-11-19", name: "Homepage Playwright Tests", description: "End-to-end tests for Template 1 homepage flows (basic navigation and rendering)", status: "Planned" },
    ],
  },
  {
    title: "Technical Fixes & Refactoring",
    tasks: [
        { id: "522-11-90", name: 'Fix "use server" in config-schemas', description: 'Removed invalid directive from schema file to resolve build error.', status: "Done" },
        { id: "522-11-32", name: "Template 1 / m3pizza integration fixes", description: "Fix logo, sticky CTA, and color theming for the m3pizza preview page.", status: "In Progress" },
    ]
  },
   {
    title: "Testing",
    tasks: [
      { id: "522-90-01", name: "Acceptance Test Suite", description: "Create end-to-end tests for all public Brand Website APIs", status: "Planned" },
      { id: "522-90-02", name: "QA Testcase Runner", description: "Build or document a QA runner/checklist for manual Brand Website tests", status: "Planned" },
    ],
  },
];

const statusVariantMap: Record<Status, VariantProps<typeof Badge>['variant']> = {
  'Planned': 'secondary',
  'In Progress': 'default',
  'Done': 'outline',
};

const statusDotClassMap: Record<Status, string> = {
    'Planned': 'bg-gray-400',
    'In Progress': 'bg-blue-500 animate-pulse',
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
