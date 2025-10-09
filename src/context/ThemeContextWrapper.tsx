
'use client';
import { ThemeProvider } from './ThemeContext';
import type { GeneralSettings } from '@/types/settings';

export function ThemeContextWrapper({ settings, children }: { settings: GeneralSettings | null, children: React.ReactNode }) {
    return (
        <ThemeProvider settings={settings}>
            {children}
        </ThemeProvider>
    );
}
