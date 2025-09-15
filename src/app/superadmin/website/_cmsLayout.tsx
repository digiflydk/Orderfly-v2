

'use client';
import CmsHeader from "@/components/cms/CmsHeader";
import Sidebar from "@/components/cms/Sidebar";
import { ThemeContextWrapper } from "@/context/ThemeContextWrapper";
import { getGeneralSettings } from "@/services/settings";
import { useEffect, useState } from "react";
import type { GeneralSettings } from "@/types/settings";


export default function CmsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<GeneralSettings | null>(null);

  useEffect(() => {
    getGeneralSettings().then(setSettings);
  }, []);
  
  return (
    <ThemeContextWrapper settings={settings}>
      <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
        <Sidebar />
        <div className="flex flex-col">
          <CmsHeader />
          <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-muted/40">
            {children}
          </main>
        </div>
      </div>
    </ThemeContextWrapper>
  );
}


