
'use client';

import Image from 'next/image';
import { OrderFlyLogo } from '@/components/icons';

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
          className="object-contain"
          data-ai-hint="logo"
        />
      </div>
    );
  }

  return (
    <>
      <OrderFlyLogo className="size-8 text-white" />
      <span className="font-semibold text-xl text-white">
        OrderFly
      </span>
    </>
  );
}
