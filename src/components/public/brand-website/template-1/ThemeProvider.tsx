'use client';

import type { BrandWebsiteDesignSystem } from '@/lib/types/brandWebsite';
import React, { createContext, useContext, useMemo } from 'react';

// Define a default theme for fallback
const defaultColors: BrandWebsiteDesignSystem['colors'] = {
  primary: '#E94F26', // OrderFly Orange
  secondary: '#FF7A29',
  background: '#FFF8F0',
  textPrimary: '#2D2D2D',
  textSecondary: '#444444',
  headerBackground: '#2D2D2D',
  footerBackground: '#2D2D2D',
};

const ThemeContext = createContext<BrandWebsiteDesignSystem['colors']>(defaultColors);

export function useTemplate1Theme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  designSystem: Partial<BrandWebsiteDesignSystem> | null;
  children: React.ReactNode;
}

export function ThemeProvider({ designSystem, children }: ThemeProviderProps) {
  const colors = useMemo(() => ({
    ...defaultColors,
    ...designSystem?.colors,
  }), [designSystem]);

  const cssVariables = {
    '--template1-color-primary': colors.primary,
    '--template1-color-secondary': colors.secondary,
    '--template1-color-background': colors.background,
    '--template1-color-text-primary': colors.textPrimary,
    '--template1-color-text-secondary': colors.textSecondary,
    '--template1-color-header-bg': colors.headerBackground,
    '--template1-color-footer-bg': colors.footerBackground,
  } as React.CSSProperties;

  return (
    <ThemeContext.Provider value={colors}>
      <div style={cssVariables}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
