'use client';
import type { StorefrontLinks } from '@/lib/storefront-types';
import type { Brand } from '@/types';
function safeHref(value: unknown) {
  return typeof value === 'string' && (/^https:\/\//.test(value) || /^\/(?!\/)/.test(value)) ? value : undefined;
}
const socialProfiles = ['facebook', 'instagram', 'tiktok', 'linkedin', 'x'] as const;
export default function Footer({brand, config, onOrderClick, onCookieSettings}: {brand: Brand; config?: StorefrontLinks | null; onOrderClick: () => void; onCookieSettings?: () => void}) {
  return <footer className="bg-m3-dark text-m3-white pb-24 md:pb-8 pt-12">
    <div className="mx-auto max-w-[1200px] px-4 flex flex-wrap justify-between gap-8">
      <div><h2 className="text-xl font-bold">{brand.name}</h2><p>Afhentning og levering</p></div>
      <nav aria-label="Footer" className="flex flex-col gap-3">
        <button onClick={onOrderClick}>Bestil fra menuen</button>
        {onCookieSettings && <button onClick={onCookieSettings}>Cookieindstillinger</button>}
        {socialProfiles.map(label => {
          const href = safeHref(config?.social?.[label]);
          return href ? <a key={label} href={href}>{label}</a> : null;
        })}
        {Object.entries(config?.legal || {}).map(([label, value]) => safeHref(value) ? <a key={label} href={safeHref(value)}>{label}</a> : null)}
      </nav>
    </div>
  </footer>;
}
