// orderfly.dk/ — Orderfly's own marketing landing (#814). Esmeralda's ordering
// landing that used to render here remains available on /m3pizza.
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { OrderflyLanding } from '@/components/orderfly-landing/orderfly-landing';
import '@/components/orderfly-landing/orderfly-landing.css';

// Fonts are committed (OFL, see ./fonts/LICENSE-OFL.txt), so neither the browser nor the build calls Google.
// next/font/google fetched them during `next build`, and a bad Google response failed App Hosting builds.
const display = localFont({ src: './fonts/bricolage-grotesque-latin-wght-normal.woff2', weight: '200 800', variable: '--ofl-font-display', display: 'swap' });
const body = localFont({ src: './fonts/inter-latin-wght-normal.woff2', weight: '100 900', variable: '--ofl-font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Orderfly – online take away til restauranter',
  description: 'Orderfly er en All-in-One platform til restauranter og take away: egen webshop, online betaling, ordreterminal, automatisk bonprint, stempelkort og kampagner.',
  alternates: { canonical: 'https://orderfly.dk/' },
  openGraph: {
    title: 'Orderfly – online take away til restauranter',
    description: 'Egen webshop, online betaling, ordreterminal, bonprint og loyalitet i én platform.',
    url: 'https://orderfly.dk/',
    siteName: 'Orderfly',
    locale: 'da_DK',
    type: 'website',
  },
};

export default function Home() {
  return <div className={`${display.variable} ${body.variable}`}><OrderflyLanding /></div>;
}
