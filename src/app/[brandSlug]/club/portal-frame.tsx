import type { ReactNode } from 'react';
import type { PortalPreset } from './brand-preset';
import { esmeraldaFeedbackAssets } from '@/lib/feedback/brand-styles';

const WEBSITE = 'https://www.esmeraldapizza.dk';
const NAVIGATION = [
  ['Menukort', '/pages/menukort'], ['Produkter', '/produkter'],
  ['Om Esmeralda', '/om-esmeralda-pizza'], ['Bestil bord', '/bordbooking'], ['Kontakt os', '/kontakt'],
] as const;

function WebsiteLinks() {
  return <>{NAVIGATION.map(([name, path]) => <a key={path} href={`${WEBSITE}${path}`}>{name}</a>)}</>;
}

function EsmeraldaHeader({ preset, base }: { preset: PortalPreset; base: string }) {
  return (
    <header className="es-club-header">
      <a className="es-club-skip" href="#club-content">Gå til indhold</a>
      <div className="es-club-header-inner">
        <a className="es-club-logo" href={WEBSITE} aria-label="Esmeralda Pizza & Restaurant forside">
          <img src={preset.logoUrl!} alt={preset.logoAlt} width={142} height={76} />
        </a>
        <nav className="es-club-desktop-nav" aria-label="Primær navigation">
          <WebsiteLinks /><a href={base} aria-current="true">Pizza Club</a>
        </nav>
        <a className="es-club-order" href="https://esmeralda.dully.io/">Bestil her <span aria-hidden="true">→</span></a>
        <details className="es-club-mobile-menu">
          <summary>Menu <span aria-hidden="true">☰</span></summary>
          <nav aria-label="Mobil navigation"><WebsiteLinks /><a href={base} aria-current="true">Pizza Club</a></nav>
        </details>
      </div>
    </header>
  );
}

type Props = {
  slug: string; base: string; preset: PortalPreset; brandName: string; signedIn: boolean;
  program: { name: string; active: boolean; stampsRequired: number; rewardDescription: string };
  memberNavigation?: ReactNode; children: ReactNode;
};

// Presentation only: the existing pages retain every form, session and consent rule.
// Other brands keep the compact frame and their own branding.
export function PortalFrame({ slug, base, preset, brandName, signedIn, program, memberNavigation, children }: Props) {
  if (slug !== 'esmeralda') return (
    <div data-loyalty-portal className="mx-auto flex w-full max-w-md flex-col px-4 pb-12 text-base">
      {preset.fontCss && <style>{preset.fontCss}</style>}
      <header className="flex justify-center py-6">
        <a href={base} className="inline-flex min-h-11 items-center">
          {preset.logoUrl ? <img src={preset.logoUrl} alt={preset.logoAlt} className="h-16 w-auto max-w-[200px] object-contain" /> : <span className="text-xl font-semibold">{brandName}</span>}
        </a>
      </header>
      {memberNavigation}
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );

  return (
    <div data-loyalty-portal data-esmeralda-club>
      {preset.fontCss && <style>{preset.fontCss}</style>}
      <EsmeraldaHeader preset={preset} base={base} />
      <main id="club-content" tabIndex={-1} className={`es-club-content${signedIn ? ' es-club-content-member' : ''}`}>
        <p className="es-club-eyebrow">Esmeralda · Amager</p>
        <div className="es-club-columns">
          <div className="es-club-form-panel">
            {memberNavigation}
            {children}
          </div>
          {!signedIn && (
            <aside className="es-club-aside" aria-label="Om Esmeralda Club">
              <section>
                <h2>Gode smage. Gode fordele.</h2>
                <p>Velkommen i {program.name}. Dit digitale stempelkort hos din lokale restaurant på Amager.</p>
                {program.active && <p>Saml {program.stampsRequired} stempler{program.rewardDescription.trim() ? <> og få <strong>{program.rewardDescription}</strong>.</> : ' og optjen din næste belønning.'}</p>}
              </section>
              <section>
                <h2>Dit kort er altid med</h2>
                <p>Åbn dit stempelkort på telefonen, og vis QR-koden ved kassen, når du handler hos os.</p>
                <a href={`${base}/vilkaar`}>Klubbens vilkår</a>
              </section>
              <section>
                <h2>Vi ses på Amager</h2>
                <p>Albaniensgade 6<br />2300 København S</p>
                <a href={`${WEBSITE}/kontakt`}>Find vej og kontakt os</a>
              </section>
              <section>
                <h2>Brug for hjælp?</h2>
                <p>Vi hjælper dig gerne med dit stempelkort.</p>
                <a href="tel:+4532505040">32 50 50 40</a>
              </section>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

// Used by the existing brand layout so its cookie settings still open the same dialog.
export function EsmeraldaClubFooter({ onOpenCookieSettings }: { onOpenCookieSettings: () => void }) {
  return (
    <footer data-esmeralda-club-footer className="es-club-footer">
      <div className="es-club-footer-grid">
        <div>
          <a href={WEBSITE} aria-label="Esmeraldas hjemmeside"><img src={esmeraldaFeedbackAssets.logo} alt="Esmeralda Pizza & Restaurant" width={142} height={76} /></a>
          <p>En bid af det italienske køkken i hjertet af Amager.</p>
        </div>
        <nav aria-label="Menu i sidefoden">
          <h2>Menu</h2>
          <a href={`${WEBSITE}/menu/pizza`}>Pizza</a><a href={`${WEBSITE}/menu/burger`}>Burgere</a>
          <a href={`${WEBSITE}/menu/pasta`}>Pasta</a><a href={`${WEBSITE}/menu/a-la-carte`}>A la carte</a>
        </nav>
        <nav aria-label="Information i sidefoden">
          <h2>Information</h2>
          <a href={`${WEBSITE}/om-esmeralda-pizza`}>Om Esmeralda</a><a href={`${WEBSITE}/bordbooking`}>Book bord</a>
          <a href={`${WEBSITE}/kontakt`}>Kontakt</a><a href={`${WEBSITE}/faq`}>FAQ</a>
        </nav>
        <div>
          <h2>Vi ses på Amager</h2>
          <p>Albaniensgade 6<br />2300 København S</p>
          <a href="tel:+4532505040">32 50 50 40</a>
          <a href="mailto:info@esmeraldapizza.dk">info@esmeraldapizza.dk</a>
        </div>
      </div>
      <div className="es-club-footer-bottom">
        <span>Esmeralda Pizza &amp; Restaurant</span>
        <div>
          <a href={`${WEBSITE}/privatlivspolitik`}>Privatlivspolitik</a>
          <a href={`${WEBSITE}/handelsbetingelser`}>Handelsbetingelser</a>
          <button type="button" onClick={onOpenCookieSettings}>Cookieindstillinger</button>
        </div>
      </div>
    </footer>
  );
}
