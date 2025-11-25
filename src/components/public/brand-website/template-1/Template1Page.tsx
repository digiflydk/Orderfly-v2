
'use client';
import { ReactNode } from "react";
import type { Template1HeaderProps } from "./Header";
import Header from "./Header";
import { ThemeProvider } from "./ThemeProvider";
import type { DesignSystem } from "@/lib/types/brandWebsite";
import Template1Head from "./head";

export type Template1PageProps = {
  header: Template1HeaderProps;
  children?: ReactNode;
  designSystem?: DesignSystem;
};

export function Template1Page({ header, children, designSystem }: Template1PageProps) {
  return (
    <ThemeProvider designSystem={designSystem}>
      <Template1Head faviconUrl={header.faviconUrl} />
      <div 
        className="min-h-screen flex flex-col text-foreground transition-colors"
        style={{ backgroundColor: 'var(--template1-color-background)'}}
      >
        <Header {...header} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}
