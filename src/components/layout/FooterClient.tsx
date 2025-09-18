
'use client';

import { useState } from 'react';
import { Footer } from './footer';
import { CookieConsent } from '../cookie-consent';
import type { Brand, Location } from '@/types';
import type { FooterTheme } from '@/types/settings';

export default function FooterClient({ brand, location, theme }: { brand: Brand; location?: Location, theme?: FooterTheme }) {
    const [isCookieModalOpen, setIsCookieModalOpen] = useState(false);
    
    return (
        <>
            <Footer
                brand={brand}
                location={location}
                version="1.0.221 • OF-453"
                onOpenCookieSettings={() => setIsCookieModalOpen(true)}
                theme={theme}
            />
            <CookieConsent brandId={brand.id} isModalOpen={isCookieModalOpen} setIsModalOpen={setIsCookieModalOpen} />
        </>
    );
}

    
