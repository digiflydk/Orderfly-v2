
export type WebsiteHeaderHsl = { h: number; s: number; l: number; opacity: number }; // 0–360, 0–100, 0–100, 0–100 (%)
export type WebsiteHeaderConfig = {
  isOverlay: boolean;                // skal ligge ovenpå hero
  sticky: boolean;
  heightPx: number;                 // fra slider "Header Højde"
  logoWidthPx: number;              // fra slider "Logo Bredde"
  topBg: WebsiteHeaderHsl;          // "Normal Tilstand (Top)"
  scrolledBg: WebsiteHeaderHsl;     // "Scrollet Tilstand"
  linkClass?: string;               // valgfri: link-styles
};
