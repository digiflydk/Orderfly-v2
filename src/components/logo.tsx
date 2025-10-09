

'use client';

import Image from 'next/image';
import { OrderFlyLogo } from '@/components/icons';
import SiteLogo from './common/SiteLogo';

interface LogoProps {
  logoUrl?: string | null;
  logoAlt?: string | null;
}

export default function Logo({ logoUrl, logoAlt }: LogoProps) {
  if (logoUrl) {
    return (
      <div className="relative h-8 w-24">
        <Image
          src={logoUrl}
          alt={logoAlt || 'Company Logo'}
          fill
          style={{ objectFit: 'contain' }}
          data-ai-hint="logo"
        />
      </div>
    );
  }

  return (
    <SiteLogo />
  );
}
