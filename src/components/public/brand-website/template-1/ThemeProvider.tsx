
'use client';

import * as React from 'react';
import type { BrandWebsiteConfig, DesignSystemInput } from '@/lib/types/brandWebsite';

type ThemeProviderProps = {
  designSystem: Partial<DesignSystemInput>;
  children: React.ReactNode;
};

// Define default values for the entire design system to ensure no variable is ever undefined.
const defaultDesignSystem: DesignSystemInput = {
    typography: {
      headingFont: 'Inter, sans-serif',
      bodyFont: 'Inter, sans-serif',
      h1Size: '3rem',
      h2Size: '2.25rem',
      h3Size: '1.875rem',
      bodySize: '1rem',
      buttonSize: '0.875rem',
    },
    colors: {
        primary: '#FFBD02',
        secondary: '#E0A800',
        background: '#000000',
        textPrimary: '#FFFFFF',
        textSecondary: '#CCCCCC',
        headerBackground: '#111111',
        footerBackground: '#0B0B0B',
    },
    buttons: {
      borderRadius: '9999px',
      paddingX: '1.25rem',
      paddingY: '0.75rem',
      fontWeight: '600',
      uppercase: false,
      primaryVariant: { background: '#FFBD02', text: '#000000' },
      secondaryVariant: { background: '#333333', text: '#FFFFFF' },
    }
};

export function ThemeProvider({ designSystem, children }: ThemeProviderProps) {
  const cssVariables = React.useMemo(() => {
    // Merge provided designSystem with defaults to ensure all values are present
    const finalDesignSystem = {
        ...defaultDesignSystem,
        ...designSystem,
        typography: { ...defaultDesignSystem.typography, ...designSystem.typography },
        colors: { ...defaultDesignSystem.colors, ...designSystem.colors },
        buttons: { ...defaultDesignSystem.buttons, ...designSystem.buttons },
    };

    const { typography, colors, buttons } = finalDesignSystem;

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

      '--template1-button-radius': buttons.borderRadius,
      '--template1-button-padding-x': buttons.paddingX,
      '--template1-button-padding-y': buttons.paddingY,
      '--template1-button-font-weight': buttons.fontWeight,
      '--template1-button-uppercase': buttons.uppercase ? 'uppercase' : 'none',
      '--template1-button-primary-bg': buttons.primaryVariant.background,
      '--template1-button-primary-text': buttons.primaryVariant.text,
      '--template1-button-secondary-bg': buttons.secondaryVariant.background,
      '--template1-button-secondary-text': buttons.secondaryVariant.text,

    } as React.CSSProperties;
  }, [designSystem]);

  return (
    <div style={cssVariables}>
      {children}
    </div>
  );
}
