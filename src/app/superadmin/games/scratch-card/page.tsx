import { gameBrands, getScratchCardDraft } from '../actions';
import { ScratchCardEditor } from '@/components/games/ScratchCardEditor';
import { getAdminDb } from '@/lib/firebase-admin';
import { esmeraldaScratchTest } from '@/lib/games/scratch-card';
export const dynamic = 'force-dynamic';
export default async function ScratchCardPage({searchParams}:{searchParams:Promise<{brand?:string}>}) {
  const brands = await gameBrands();
  const requested = (await searchParams).brand;
  const brandId = brands.some(b=>b.id===requested) ? requested! : brands[0]?.id;
  const saved = brandId ? await getScratchCardDraft(brandId) : null;
  const draft = saved || (brandId && brands.find(b=>b.id===brandId)?.slug==='esmeralda' ? esmeraldaScratchTest(brandId) : null);
  const status=brandId?(await getAdminDb().collection('gameScratchDrafts').doc(brandId).get()).data()?.status||'draft':'draft';
  return <main className="space-y-4 p-6">
    <h1 className="text-3xl font-semibold">Skrabelod</h1>
    <p className="text-muted-foreground">Opsæt spillet trin for trin, se gæstens oplevelse og test, før du aktiverer det.</p>
    {brandId ? <ScratchCardEditor key={brandId} brands={brands} brandId={brandId} draft={draft} status={status} preset={!saved && !!draft}/> : <p>Du har ikke adgang til et brand med website-rettigheder.</p>}
  </main>;
}
