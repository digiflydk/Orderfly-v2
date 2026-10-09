import { redirect } from 'next/navigation';
export default async function RetiredPreview({params, searchParams}: {
  params: Promise<{brandSlug: string; locationSlug: string}>;
  searchParams: Promise<{deliveryMethod?: string}>;
}) {
  const {brandSlug, locationSlug} = await params;
  const method = (await searchParams).deliveryMethod === 'delivery' ? 'delivery' : 'pickup';
  redirect(`/${encodeURIComponent(brandSlug)}/${encodeURIComponent(locationSlug)}?deliveryMethod=${method}`);
}
