'use client';

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
    getGeneralSettings().then(setSettings).catch(() => {});
  }, []);

  return (
    <ThemeContextWrapper settings={settings}>
      <main className="mx-auto w-full max-w-screen-2xl p-4 md:p-6">
        {children}
      </main>
    </ThemeContextWrapper>
  );
}
