
import type { ReactNode } from "react";
import type { Template1HeaderProps } from "./Header";
import { Header } from "./Header";
import type { BrandWebsiteDesignSystem } from "@/lib/types/brandWebsite";
import { ThemeProvider } from "./ThemeProvider";

export type Template1PageProps = {
  header: Template1HeaderProps;
  designSystem: Partial<BrandWebsiteDesignSystem> | null;
  children?: ReactNode;
};

export function Template1Page({ header, designSystem, children }: Template1PageProps) {
  return (
    <ThemeProvider designSystem={designSystem}>
        <div className="min-h-screen flex flex-col bg-[var(--template1-color-background)] text-[var(--template1-color-text-primary)]">
            <Header {...header} />
            <main className="flex-1">
                {children}
            </main>
        </div>
    </ThemeProvider>
  );
}
