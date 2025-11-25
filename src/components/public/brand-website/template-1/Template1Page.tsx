
'use client';

import { ReactNode } from "react";
import { Header, type Template1HeaderProps } from "./Header";
import { Template1ThemeProvider } from './ThemeProvider';
import type { DesignSystem } from "@/lib/types/brandWebsite";

export type Template1PageProps = {
  header: Template1HeaderProps;
  designSystem: DesignSystem | null;
  children?: ReactNode;
};

export function Template1Page({ header, designSystem, children }: Template1PageProps) {
  return (
    <Template1ThemeProvider designSystem={designSystem}>
      <div
        className="min-h-screen flex flex-col text-foreground"
        style={{
          backgroundColor: 'var(--template1-color-background)',
          fontFamily: 'var(--template1-font-family-body, sans-serif)',
        }}
      >
        <Header {...header} />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </Template1ThemeProvider>
  );
}
