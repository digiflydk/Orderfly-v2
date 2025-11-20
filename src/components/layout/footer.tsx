
'use client';

import Link from "next/link";
import type { Brand, Location } from "@/types";
import type { FooterTheme } from "@/types/settings";
import { Globe } from 'lucide-react';

interface FooterProps {
  brand?: Brand | null;
  location?: Location;
  version: string;
  theme?: FooterTheme;
  onOpenCookieSettings?: () => void;
}

export function Footer({ brand, location, version, onOpenCookieSettings, theme }: FooterProps) {
  return (
    <footer className="w-full border-t bg-muted/30" style={{'--border': 'hsl(var(--border))'} as React.CSSProperties}>
      <div className="mx-auto max-w-[1140px] px-4 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <button onClick={onOpenCookieSettings} className="flex items-center gap-1 hover:text-foreground">
            <Globe className="h-4 w-4" />
            <span>English</span>
          </button>
          <div className="flex items-center gap-2">
            <span>1.0.244 • OF-514</span>
            <span className="opacity-50">·</span>
            <span>Powered by OrderFly</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
