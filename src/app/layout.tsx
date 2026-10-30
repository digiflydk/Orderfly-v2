import './globals.css';
import '@/styles/commerce-ui.css';
import '@/styles/storefront-v2.css';
import '@/components/product/product-dialog-v2.css';
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
