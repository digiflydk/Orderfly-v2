
'use client';

import Head from 'next/head';
import { Template1HeaderProps } from './Header';

export function Template1Head({ faviconUrl, title, description, ogImageUrl, canonicalUrl, robotsNoIndex }: Template1HeaderProps) {
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
    )
}
