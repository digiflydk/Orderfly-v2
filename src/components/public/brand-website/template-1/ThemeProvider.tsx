
'use client';

import { createContext, useContext, useCallback, useEffect } from 'react';
import type { BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import { defaultTheme } from './theme';

interface ThemeProviderProps {
  config: Partial<BrandWebsiteConfig>;
  children: React.ReactNode;
}

const ThemeContext = createContext({});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ config, children }: ThemeProviderProps) {
    
  const applyTheme = useCallback(() => {
    const root = document.documentElement;
    const design = { ...defaultTheme, ...config.designSystem };
    
    // Colors
    if (design.colors) {
        Object.entries(design.colors).forEach(([name, value]) => {
            if (value) root.style.setProperty(`--template1-color-${name}`, value);
        });
    }

    // Typography
    if (design.typography) {
        const typo = { ...defaultTheme.typography, ...design.typography };
        root.style.setProperty('--template1-font-family-heading', typo.headingFont);
        root.style.setProperty('--template1-font-family-body', typo.bodyFont);
        root.style.setProperty('--template1-font-size-h1', typo.h1Size);
        root.style.setProperty('--template1-font-size-h2', typo.h2Size);
        root.style.setProperty('--template1-font-size-h3', typo.h3Size);
        root.style.setProperty('--template1-font-size-body', typo.bodySize);
        root.style.setProperty('--template1-font-size-button', typo.buttonSize);
    }
    
    // Buttons
    if (design.buttons) {
        const buttons = { ...defaultTheme.buttons, ...design.buttons };
        root.style.setProperty('--template1-button-radius', buttons.borderRadius);
        root.style.setProperty('--template1-button-padding-x', buttons.paddingX);
        root.style.setProperty('--template1-button-padding-y', buttons.paddingY);
        root.style.setProperty('--template1-button-font-weight', buttons.fontWeight);
        if (buttons.primaryVariant) {
            root.style.setProperty('--template1-button-primary-bg', buttons.primaryVariant.background);
            root.style.setProperty('--template1-button-primary-text', buttons.primaryVariant.text);
        }
    }

  }, [config]);

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  return <ThemeContext.Provider value={{}}>{children}</ThemeContext.Provider>;
}
