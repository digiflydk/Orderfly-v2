
'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { BrandWebsiteConfig, DesignSystem } from '@/lib/types/brandWebsite';

interface ThemeContextType {
  designSystem: DesignSystem | null;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTemplate1Theme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTemplate1Theme must be used within a Template1ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  designSystem: DesignSystem | null;
}

export function Template1ThemeProvider({ children, designSystem }: ThemeProviderProps) {
  const cssVariables = useMemo(() => {
    if (!designSystem) return {};

    const variables: React.CSSProperties & { [key: string]: string } = {};

    // Colors
    if (designSystem.colors) {
      for (const [key, value] of Object.entries(designSystem.colors)) {
        if (value) {
          variables[`--template1-color-${key}`] = value;
        }
      }
    }

    // Typography
    if (designSystem.typography) {
        if(designSystem.typography.headingFont) variables['--template1-font-family-heading'] = designSystem.typography.headingFont;
        if(designSystem.typography.bodyFont) variables['--template1-font-family-body'] = designSystem.typography.bodyFont;
        if(designSystem.typography.h1Size) variables['--template1-font-size-h1'] = designSystem.typography.h1Size;
        if(designSystem.typography.h2Size) variables['--template1-font-size-h2'] = designSystem.typography.h2Size;
        if(designSystem.typography.h3Size) variables['--template1-font-size-h3'] = designSystem.typography.h3Size;
        if(designSystem.typography.bodySize) variables['--template1-font-size-body'] = designSystem.typography.bodySize;
        if(designSystem.typography.buttonSize) variables['--template1-font-size-button'] = designSystem.typography.buttonSize;
    }

    return variables;
  }, [designSystem]);

  return (
    <ThemeContext.Provider value={{ designSystem }}>
      <div style={cssVariables}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
