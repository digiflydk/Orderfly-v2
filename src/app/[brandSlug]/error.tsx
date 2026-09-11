'use client';
export default function BrandError({ error, reset }: { error:any; reset:()=>void }) {
  return (<div className="mx-auto max-w-xl p-6">
    <h1 className="text-xl font-semibold">Noget gik galt på brand-siden</h1>
    <p className="mt-2 text-sm text-muted-foreground">Prøv at genindlæse eller gå tilbage.</p>
    <div className="mt-4 flex gap-3">
      <button data-commerce-retry onClick={()=>reset()} className="rounded bg-black px-3 py-2 text-white">Prøv igen</button>
      <a href="/" className="rounded border px-3 py-2">Til forsiden</a>
    </div>
  </div>);
}
