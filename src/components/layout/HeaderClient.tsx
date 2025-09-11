
"use client";
import { useEffect, useState, useMemo } from "react";
import { Header } from "./header";
import type { WebsiteHeaderConfig } from "@/types/website";
import type { GeneralSettings, Brand, NavLink } from "@/types";
import { usePathname } from 'next/navigation';

function toHsla({ h, s, l, opacity }: { h:number; s:number; l:number; opacity:number }) {
  const a = Math.max(0, Math.min(1, opacity / 100));
  return `hsla(${h} ${s}% ${l}% / ${a})`;
}

const fallbackLinks: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/pricing",  label: "Pricing" },
  { href: "/contact",  label: "Contact" },
];

export default function HeaderClient({
  brand,
  settings,
  config,
}: {
  brand?: Brand;
  settings: GeneralSettings | null;
  config: WebsiteHeaderConfig;
}) {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const vars = useMemo(() => {
    const top = toHsla(config.topBg);
    const scr = toHsla(config.scrolledBg);
    return {
      ["--header-height" as any]: `${config.heightPx}px`,
      ["--logo-width" as any]: `${config.logoWidthPx}px`,
      ["--bg-top" as any]: top,
      ["--bg-scrolled" as any]: scr,
    } as React.CSSProperties;
  }, [config]);

  const isStickyActive = !!config.sticky && scrolled;
  const navLinks = settings?.headerNavLinks?.length ? settings.headerNavLinks : fallbackLinks;
  const isHomepage = pathname === '/';
  const logoUrl = isHomepage ? settings?.logoUrl : brand?.logoUrl;
  const logoAlt = isHomepage ? (settings?.websiteTitle || 'OrderFly') : (brand?.name || 'OrderFly');

  return (
    <div style={vars} data-scrolled={scrolled ? "true" : "false"}>
      {isStickyActive && <div aria-hidden style={{ height: `var(--header-height)` }} />}
      <div
        data-header-wrap
        className={isStickyActive ? "fixed top-0 left-0 right-0 z-[60]" : ""}
        style={isStickyActive ? { background: "var(--bg-scrolled)" } : undefined}
      >
        <Header brand={brand} logoUrl={logoUrl} logoAlt={logoAlt} settings={settings} config={config} navLinks={navLinks} />
      </div>

      <style>{`
        [data-scrolled="true"] [data-header] { 
          background: var(--bg-scrolled); 
          border-bottom: 1px solid hsl(var(--border));
        }
        [data-header-wrap]:not([class*="fixed"]) [data-header] {
          background: var(--bg-top);
          border-bottom-color: transparent;
        }
      `}</style>
    </div>
  );
}
