// src/components/public/brand-website/template-1/Template1Page.tsx
import { ReactNode } from "react";
import { Header, type Template1HeaderProps } from "./Header";

export type Template1PageProps = {
  header: Template1HeaderProps;
  children?: ReactNode;
};

export function Template1Page({ header, children }: Template1PageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header {...header} />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export default Template1Page;
