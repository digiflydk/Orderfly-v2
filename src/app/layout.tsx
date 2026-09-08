import './globals.css';
import '@/styles/commerce-ui.css';
import { StorefrontVitals } from '@/components/storefront-vitals';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orderfly Studio',
  description: 'Dev baseline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>{children}<StorefrontVitals /></body>
    </html>
  );
}
