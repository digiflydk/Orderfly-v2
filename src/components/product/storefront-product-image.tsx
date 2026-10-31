'use client';

import Image, { type ImageProps } from 'next/image';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { esmeraldaPizzaImage, type PizzaImageProduct } from '@/lib/esmeralda-menu-images';
import { safeImage } from '@/lib/images';
import { cn } from '@/lib/utils';

/** Presentation-only cutouts. The catalog/order keeps its original image URL. */
export function StorefrontProductImage({ product, src, className, style, ...props }: Omit<ImageProps, 'src'> & {
  product: PizzaImageProduct;
  src?: ImageProps['src'];
}) {
  const isV2 = useStorefrontV2();
  const original = src ?? safeImage(product.imageUrl);
  const cutout = esmeraldaPizzaImage(isV2, {...product, imageUrl: typeof original === 'string' ? original : undefined});
  return <Image {...props} src={cutout?.src || original} data-pizza-cutout={cutout ? '' : undefined}
    className={cn(className, cutout && 'object-contain')}
    style={cutout ? {...style, objectFit: 'contain'} : style} />;
}
