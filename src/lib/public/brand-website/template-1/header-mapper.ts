
import type { WebsiteHeaderConfig } from "@/types/website";
import type { BrandWebsiteConfig } from "@/lib/types/brandWebsite";
import { resolveLinkClass } from "@/lib/brand-website/utils/public-config-helpers";

function toHsla(color: { h: number, s: number, l: number }, opacity: number) {
  const a = Math.max(0, Math.min(1, opacity / 100));
  return `hsla(${color.h} ${color.s}% ${color.l}% / ${a})`;
}

export function buildTemplate1HeaderProps(config: BrandWebsiteConfig) {
  const headerSettings = config.designSystem?.header;
  const buttonStyles = config.designSystem?.buttons?.primaryVariant;

  const headerConfig: WebsiteHeaderConfig = {
    isOverlay: true, // Example, make this configurable if needed
    sticky: headerSettings?.sticky ?? true,
    heightPx: parseInt(headerSettings?.height?.replace('px', '') || '80', 10),
    logoWidthPx: config.designSystem.logoWidth ?? 120,
    topBg: { h: 0, s: 0, l: 0, opacity: 0 }, // Assuming transparent initially
    scrolledBg: {
      h: config.designSystem.colors?.headerBackground?.h ?? 0,
      s: config.designSystem.colors?.headerBackground?.s ?? 0,
      l: config.designSystem.colors?.headerBackground?.l ?? 0,
      opacity: 100,
    },
    linkClass: resolveLinkClass(config.designSystem.typography?.navLink?.color),
  };

  const ctaText = config.designSystem?.buttons?.ctaText || "Bestil nu";
  const orderHref = `/m3pizza/order`; // This should eventually come from config

  return {
    header: headerConfig,
    logoUrl: config.logoUrl,
    ctaText,
    orderHref,
  };
}
