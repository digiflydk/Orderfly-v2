
"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Home, PanelLeft, Brush, FileText, Settings, ChevronDown, Search, Share2, MousePointerClick, Cookie, Building, Sparkles, Users, HeartHandshake, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useState, useEffect, Suspense } from "react";
import Logo from "@/components/logo";
import { getGeneralSettings } from "@/services/settings";
import type { GeneralSettings } from "@/types/settings";
import { usePathname } from "next/navigation";


const settingsNavLinks = [
    { href: "/superadmin/website/settings/general", label: "General", icon: Settings },
    { href: "/superadmin/website/settings/ai", label: "AI Prompt", icon: Sparkles },
    { href: "/superadmin/website/settings/seo", label: "SEO", icon: Search },
    { href: "/superadmin/website/settings/social", label: "Social Share", icon: Share2 },
    { href: "/superadmin/website/settings/tracking", label: "Tracking", icon: MousePointerClick },
    { href: "#", label: "Cookies", icon: Cookie },
    { href: "#", label: "Business listing", icon: Building },
]

function CmsHeaderInner() {
  const pathname = usePathname();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        setIsSettingsOpen(pathname.startsWith('/cms/settings'));
        
        async function loadSettings() {
            const loadedSettings = await getGeneralSettings();
            setSettings(loadedSettings);
        }
        loadSettings();
    }
  }, [pathname]);


  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
        <Sheet>
            <SheetTrigger asChild>
                <Button size="icon" variant="outline" className="sm:hidden">
                    <PanelLeft className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs bg-black text-white border-gray-800">
                <SheetHeader className="mb-6 text-left">
                    <SheetTitle asChild>
                         <Link href="/cms/dashboard" className="flex items-center gap-2 font-semibold">
                            <Logo logoUrl={settings?.logoUrl} logoAlt={settings?.logoAlt} />
                        </Link>
                    </SheetTitle>
                    <SheetDescription>
                        Administrer din hjemmesides indstillinger og indhold.
                    </SheetDescription>
                </SheetHeader>
                <nav className="grid gap-4 text-base font-medium">
                    <Link href="/cms/pages" className={cn("flex items-center gap-4 px-2.5 text-gray-400 hover:text-white", { "text-white": pathname.startsWith('/cms/pages') })}>
                        <FileText className="h-5 w-5" />
                        Indhold
                    </Link>
                    <Link href="/cms/dashboard" className={cn("flex items-center gap-4 px-2.5 text-gray-400 hover:text-white", { "text-white": pathname === '/cms/dashboard' })}>
                        <Brush className="h-5 w-5" />
                        Design
                    </Link>
                    <Link href="/cms/leads" className={cn("flex items-center gap-4 px-2.5 text-gray-400 hover:text-white", { "text-white": pathname.startsWith('/cms/leads') })}>
                        <Users className="h-5 w-5" />
                        Cust. Leads
                    </Link>
                    <Link href="/cms/customers" className={cn("flex items-center gap-4 px-2.5 text-gray-400 hover:text-white", { "text-white": pathname.startsWith('/cms/customers') })}>
                        <HeartHandshake className="h-5 w-5" />
                        Kunder
                    </Link>
                    <Collapsible open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                        <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-2.5 text-gray-400 transition-all hover:text-white">
                            <div className="flex items-center gap-4">
                                <Settings className="h-5 w-5" />
                                <span>Settings</span>
                            </div>
                            <ChevronDown className={cn("h-5 w-5 transition-transform", { "rotate-180": isSettingsOpen })} />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pl-10">
                            <ul className="grid items-start py-2 text-sm font-medium">
                               {settingsNavLinks.map(link => (
                                 <li key={link.label}>
                                    <Link href={link.href} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-gray-400 transition-all hover:text-white", { "bg-gray-800 text-white": pathname.startsWith(link.href) && link.href !== "#" })}>
                                        <link.icon className="h-4 w-4" />
                                        {link.label}
                                    </Link>
                                 </li>
                               ))}
                            </ul>
                        </CollapsibleContent>
                    </Collapsible>
                </nav>
            </SheetContent>
        </Sheet>
        <h1 className="text-xl font-bold">Design Indstillinger</h1>
        <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline">
                <Link href="/" aria-label="Besøg side" target="_blank">
                    <Home className="mr-2 h-4 w-4" />
                    Besøg Side
                </Link>
            </Button>
        </div>
    </header>
  );
}


export default function CmsHeader() {
    return (
        <Suspense fallback={<header className="h-14"></header>}>
            <CmsHeaderInner />
        </Suspense>
    )
}
