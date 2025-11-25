
'use client';
import { ReactNode } from "react";
import { Header, Template1HeaderProps } from "./Header";
import { ThemeProvider } from "./ThemeProvider";
import { Template1Head } from './Template1Head';

export type Template1PageProps = {
  header: Template1HeaderProps;
  children?: ReactNode;
};

export function Template1Page({ header, children }: Template1PageProps) {
    if (!header?.designSystem) {
        return <div className="bg-m3-cream min-h-screen">Loading theme...</div>;
    }

    return (
        <ThemeProvider designSystem={header.designSystem}>
            <Template1Head {...header} />
            <div
                className="min-h-screen flex flex-col"
                style={{
                    backgroundColor: 'var(--template1-color-background)',
                    color: 'var(--template1-color-text-primary)',
                    fontFamily: 'var(--template1-font-family-body)',
                }}
            >
                <Header {...header} />
                <main className="flex-1">
                    {children}
                </main>
            </div>
        </ThemeProvider>
    );
}
