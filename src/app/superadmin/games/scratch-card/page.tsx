import { gameBrands, getScratchCardDraft } from '../actions';
import { ScratchCardEditor } from '@/components/games/ScratchCardEditor';
export const dynamic = 'force-dynamic';
export default async function ScratchCardPage({searchParams}:{searchParams:Promise<{brand?:string}>}) {
  const brands = await gameBrands();
  const requested = (await searchParams).brand;
  const brandId = brands.some(b=>b.id===requested) ? requested! : brands[0]?.id;
  const draft = brandId ? await getScratchCardDraft(brandId) : null;
  return <main className="space-y-4 p-6">
    <h1 className="text-3xl font-semibold">Scratch Card</h1>
    <p className="text-muted-foreground">Første version til test. Udkastet udgiver ikke et spil eller en præmie til kunder.</p>
    {brandId ? <ScratchCardEditor key={brandId} brands={brands} brandId={brandId} draft={draft}/> : <p>Du har ikke adgang til et brand med website-rettigheder.</p>}
  </main>;
}
