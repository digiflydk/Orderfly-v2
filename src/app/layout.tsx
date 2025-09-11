import './globals.css';
import type { ReactNode } from "react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Orderfly Studio",
  description: "Next.js 15 base app"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
