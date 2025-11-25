
'use client';
import Head from 'next/head';

interface Template1HeadProps {
    faviconUrl?: string | null;
}

export default function Template1Head({ faviconUrl }: Template1HeadProps) {
  const finalFaviconUrl = faviconUrl || '/favicon.ico';
  
  return (
    <Head>
      <link rel="icon" href={finalFaviconUrl} sizes="any" />
    </Head>
  );
}
