
'use client';

import { useState } from 'react';
import { Footer } from './footer';
import { CookieConsent } from '../cookie-consent';
import type { Brand, Location } from '@/types';
import type { FooterTheme } from '@/types/settings';

export default function FooterClient({ brand, location, theme, version }: { brand: Brand; location?: Location, theme?: FooterTheme, version?: string }) {
    const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
    
    return (
        <>
            <Footer
                brand={brand}
                location={location}
                version="1.0.229 • OF-511"
                onOpenCookieSettings={() => setIsCookieModalOpen(true)}
                theme={theme}
            />
            <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
        </>
    );
}

    
