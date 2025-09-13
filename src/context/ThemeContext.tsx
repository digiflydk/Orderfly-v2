
"use client";

import { createContext, useState, useCallback, useEffect, useContext } from 'react';
import type { GeneralSettings } from '@/types/settings';

type HSLColor = { h: number; s: number; l: number };
type FontSizes = {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  body: number;
};

export interface Theme {
  colors: {
    primary: HSLColor;
    background: HSLColor;
    accent: HSLColor;
  };
  fontSizes: FontSizes;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  setThemeColor: (colorName: keyof Theme['colors'], hsl: HSLColor) => void;
  setFontSize: (sizeName: keyof FontSizes, sizeInRem: number) => void;
  isLoaded: boolean;
}

export const defaultTheme: Theme = {
  colors: {
    primary: { h: 211, s: 100, l: 50 },
    background: { h: 210, s: 100, l: 95 },
    accent: { h: 211, s: 100, l: 40 },
  },
  fontSizes: {
    h1: 4,
    h2: 2.25,
    h3: 1.875,
    h4: 1.5,
    body: 1.125,
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ settings, children }: { settings: GeneralSettings | null, children: React.ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    return {
        colors: settings?.themeColors || defaultTheme.colors,
        fontSizes: settings?.themeFontSizes || defaultTheme.fontSizes,
    }
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const applyTheme = useCallback((themeToApply: Theme) => {
    const root = document.documentElement;
    // Colors
    Object.entries(themeToApply.colors).forEach(([name, hsl]) => {
      root.style.setProperty(`--${name}`, `${hsl.h} ${hsl.s}% ${hsl.l}%`);
    });
    // Font Sizes
    Object.entries(themeToApply.fontSizes).forEach(([name, size]) => {
      root.style.setProperty(`--font-size-${name}`, `${size}rem`);
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
    setIsLoaded(true);
  }, [theme, applyTheme]);
  
  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
  };
  
  const setThemeColor = (colorName: keyof Theme['colors'], hsl: HSLColor) => {
    const newTheme = { ...theme, colors: { ...theme.colors, [colorName]: hsl } };
    handleSetTheme(newTheme);
  };
  
  const setFontSize = (sizeName: keyof FontSizes, sizeInRem: number) => {
     const newTheme = { ...theme, fontSizes: { ...theme.fontSizes, [sizeName]: sizeInRem } };
     handleSetTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, setThemeColor, setFontSize, isLoaded }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
