'use client';

import Head from 'next/head';

export interface Template1HeadProps {
  faviconUrl?: string | null;
  title?: string | null;
  description?: string | null;
  ogImageUrl?: string | null;
  canonicalUrl?: string | null;
  robotsNoIndex?: boolean | null;
}

export function Template1Head({
  faviconUrl,
  title,
  description,
  ogImageUrl,
  canonicalUrl,
  robotsNoIndex,
}: Template1HeadProps) {
  return (
    <Head>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      {faviconUrl && <link rel="icon" href={faviconUrl} sizes="any" />}

      {/* Open Graph */}
      {title && <meta property="og:title" content={title} />}
      {description && <meta property="og:description" content={description} />}
      {ogImageUrl && <meta property="og:image" content={ogImageUrl} />}

      {/* Robots */}
      {robotsNoIndex && <meta name="robots" content="noindex" />}
    </Head>
  );
}
