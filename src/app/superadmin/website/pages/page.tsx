
'use client';

import CmsLayout from '../_cmsLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Home, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";

const pageSections = [
  {
    name: "Home",
    description: "Administrer indholdet på forsiden.",
    href: "/superadmin/website/pages/home",
    icon: Home,
  },
  {
    name: "Header",
    description: "Rediger navigationslinks og logo.",
    href: "/superadmin/website/pages/header",
    icon: ArrowUp,
  },
  {
    name: "Footer",
    description: "Opdater kontaktoplysninger og sociale links.",
    href: "/superadmin/website/pages/footer",
    icon: ArrowDown,
  },
];

function CmsPagesPageContent() {
  return (
    <div className="space-y-8">
       <div>
            <h1 className="text-2xl font-bold">Sideindhold</h1>
            <p className="text-muted-foreground">Vælg en sektion for at redigere indholdet.</p>
       </div>
        <Card className="shadow-lg">
            <CardContent className="p-0">
                <ul className="divide-y">
                    {pageSections.map((section, index) => (
                         <li key={section.name} className="p-4 hover:bg-muted/50 transition-colors">
                            <Link href={section.href} className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                     <div className="bg-muted rounded-md p-2">
                                        <section.icon className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{section.name}</h3>
                                        <p className="text-sm text-muted-foreground">{section.description}</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </Link>
                         </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    </div>
  );
}


export default function CmsPagesPage() {
    return (
        <CmsLayout>
            <CmsPagesPageContent />
        </CmsLayout>
    )
}
