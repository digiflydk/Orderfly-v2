import Image from 'next/image';
import type { Brand } from '@/types';
import { safeImage } from '@/lib/images';

/** The approved Esmeralda negative logo, copied byte-for-byte from its existing public URL. */
export function StorefrontBrandLogo({ brand, priority, className = 'object-contain object-left' }: {
  brand: Pick<Brand, 'slug' | 'name' | 'logoUrl'>;
  priority?: boolean;
  className?: string;
}) {
  if (brand.slug === 'esmeralda') return <Image src="/images/esmeralda-v2/logo.png" alt={brand.name}
    width={425} height={92} sizes="180px" priority={priority} unoptimized className={`h-full w-full ${className}`} />;
  return brand.logoUrl
    ? <Image src={safeImage(brand.logoUrl)} alt={brand.name} fill sizes="180px" priority={priority} className={className} />
    : <span className="text-xl font-bold">{brand.name}</span>;
}
