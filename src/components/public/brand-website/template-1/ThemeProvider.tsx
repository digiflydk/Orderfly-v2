'use client';

import * as React from 'react';
import { merge } from 'lodash';

// Local type definitions to remove dependency on obsolete module
type DesignSystemInput = {
  typography: {
    headingFont: string;
    bodyFont: string;
    h1Size: string;
    h2Size: string;
    h3Size: string;
    bodySize: string;
    buttonSize: string;
  };
  colors: {
    primary: string;
    secondary: string;
    background: string;
    textPrimary: string;
    textSecondary: string;
    headerBackground: string;
    footerBackground: string;
  };
  buttons: {
    borderRadius: string;
    paddingX: string;
    paddingY: string;
    fontWeight: string;
    uppercase: boolean;
    primaryVariant: { background: string; text: string };
    secondaryVariant: { background: string; text: string };
  };
};

type ThemeProviderProps = {
  designSystem: Partial<DesignSystemInput>;
  children: React.ReactNode;
};

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
    primary: '#000000',
    secondary: '#F0F0F0',
    background: '#FFFFFF',
    textPrimary: '#111111',
    textSecondary: '#666666',
    headerBackground: '#FFFFFF',
    footerBackground: '#111111',
  },
  buttons: {
    borderRadius: '9999px',
    paddingX: '1.25rem',
    paddingY: '0.75rem',
    fontWeight: '600',
    uppercase: false,
    primaryVariant: { background: '#FFBD02', text: '#000000' },
    secondaryVariant: { background: '#333333', text: '#FFFFFF' },
  },
};

export function Template1ThemeProvider({ designSystem, children }: ThemeProviderProps) {
  const finalDesignSystem = merge({}, defaultDesignSystem, designSystem);
  const { typography, colors, buttons } = finalDesignSystem;

  const cssVariables = {
    '--template1-font-family-heading': typography.headingFont,
    '--template1-font-family-body': typography.bodyFont,
    '--template1-font-size-h1': typography.h1Size,
    '--template1-font-size-h2': typography.h2Size,
    '--template1-font-size-h3': typography.h3Size,
    '--template1-font-size-body': typography.bodySize,
    '--template1-font-size-button': typography.buttonSize,
    '--template1-color-background': colors.background,
    '--template1-color-surface': colors.secondary,
    '--template1-color-primary': colors.primary,
    '--template1-color-primary-text': buttons.primaryVariant.text,
    '--template1-color-secondary': colors.secondary,
    '--template1-color-secondary-text': buttons.secondaryVariant.text,
    '--template1-color-text-primary': colors.textPrimary,
    '--template1-color-text-secondary': colors.textSecondary,
    '--template1-header-background': colors.headerBackground,
    '--template1-footer-background': colors.footerBackground,
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

  return <div style={cssVariables}>{children}</div>;
}
