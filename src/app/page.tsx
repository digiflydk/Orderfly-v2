// orderfly.dk/ — Orderfly's own marketing landing (#814). Esmeralda's ordering
// landing that used to render here remains available on /m3pizza.
import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter } from 'next/font/google';
import { OrderflyLanding } from '@/components/orderfly-landing/orderfly-landing';
import '@/components/orderfly-landing/orderfly-landing.css';

// next/font self-hosts the files at build time: the browser never calls Google.
const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['700', '800'], variable: '--ofl-font-display', display: 'swap' });
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--ofl-font-body', display: 'swap' });

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
