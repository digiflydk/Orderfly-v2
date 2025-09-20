import './globals.css';
import type { Metadata } from 'next';

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: 'Orderfly Studio',
  description: 'Dev baseline',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
