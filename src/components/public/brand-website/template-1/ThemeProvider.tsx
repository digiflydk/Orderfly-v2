
'use client';
import { type BrandWebsiteConfig } from '@/lib/types/brandWebsite';
import React, { useMemo } from 'react';

type ThemeProviderProps = {
  config: Partial<BrandWebsiteConfig>;
  children: React.ReactNode;
};

const defaultColors = {
  primary: '#000000',
  secondary: '#F0F0F0',
  background: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#666666',
  headerBackground: '#FFFFFF',
  footerBackground: '#111111',
};

const defaultTypography = {
  headingFont: 'system-ui, sans-serif',
  bodyFont: 'system-ui, sans-serif',
  h1Size: '3rem',
  h2Size: '2.25rem',
  h3Size: '1.875rem',
  bodySize: '1rem',
  buttonSize: '0.875rem',
};

export function ThemeProvider({ config, children }: ThemeProviderProps) {
  const cssVariables = useMemo(() => {
    const typography = { ...defaultTypography, ...config.designSystem?.typography };
    const colors = { ...defaultColors, ...config.designSystem?.colors };

    return {
      '--template1-font-family-heading': typography.headingFont,
      '--template1-font-family-body': typography.bodyFont,
      '--template1-font-size-h1': typography.h1Size,
      '--template1-font-size-h2': typography.h2Size,
      '--template1-font-size-h3': typography.h3Size,
      '--template1-font-size-body': typography.bodySize,
      '--template1-font-size-button': typography.buttonSize,

      '--template1-color-primary': colors.primary,
      '--template1-color-secondary': colors.secondary,
      '--template1-color-background': colors.background,
      '--template1-color-text-primary': colors.textPrimary,
      '--template1-color-text-secondary': colors.textSecondary,
      '--template1-color-header-background': colors.headerBackground,
      '--template1-color-footer-background': colors.footerBackground,
    } as React.CSSProperties;
  }, [config]);

  return (
    <div style={cssVariables} className="font-body">
      {children}
    </div>
  );
}
