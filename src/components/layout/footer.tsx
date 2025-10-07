
'use client';

import Link from "next/link";
import Image from "next/image";
import type { Brand, Location } from "@/types";
import type { FooterTheme } from "@/types/settings";
import { Facebook, Instagram, Linkedin, LucideIcon, Twitter, Youtube } from 'lucide-react';
import SiteLogo from "../common/SiteLogo";
import { useState } from "react";
import { CookieConsent } from "../cookie-consent";

interface FooterProps {
  brand?: Brand | null;
  location?: Location;
  version: string;
  theme?: FooterTheme;
  onOpenCookieSettings?: () => void;
}

const socialIcons: Record<string, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  x: Twitter,
  youtube: Youtube,
  linkedin: Linkedin,
};

export function Footer({ brand, location, version, onOpenCookieSettings, theme }: FooterProps) {
  const footerStyle: React.CSSProperties = {
    backgroundColor: 'var(--of-footer-bg)',
    color: 'var(--of-footer-text)',
  };

  const linkStyle = {
    color: 'var(--of-footer-link)',
  };

  return (
    <footer className="w-full" style={footerStyle}>
      <div className="mx-auto max-w-[1140px] px-4 py-10 grid gap-8 md:grid-cols-12">
        <div className="md:col-span-4 space-y-4">
          <SiteLogo priority={false} />
          {theme?.legalText && <p className="text-sm opacity-80">{theme.legalText}</p>}
          {(theme?.socials ?? []).length > 0 && (
            <div className="flex gap-4 pt-4">
              {theme!.socials!.map((s, i) => {
                const Icon = socialIcons[s.kind];
                return Icon ? (
                  <a 
                    key={i} 
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.kind} 
                    className="transition-colors hover:opacity-80"
                    style={linkStyle}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="sr-only">{s.kind}</span>
                  </a>
                ) : null;
              })}
            </div>
          )}
        </div>

        {(theme?.columns ?? []).map((col, i) => (
          <div key={i} className="md:col-span-2">
            {col?.title && <h4 className="mb-3 font-semibold">{col.title}</h4>}
            <ul className="space-y-2">
              {(col?.links ?? []).map((l, j) => (
                <li key={j}>
                  <Link
                    href={l.href}
                    className="transition-colors hover:text-[var(--of-footer-link-hover)]"
                    style={linkStyle}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-[1140px] px-4 py-4 border-t" style={{ borderColor: 'var(--of-footer-link)' }}>
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--of-footer-text)' }}>
          <span>🌐 English</span>
          <div className="flex items-center gap-2">
            <span>1.0.232 • OF-532</span>
            <span className="opacity-50">·</span>
            <span>Powered by OrderFly</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
