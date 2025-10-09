export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function BrandSafe({ params }: { params: { brandSlug: string } }) {
  return (
    <div style={{padding:16, fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:20,fontWeight:600}}>Brand Safe OK • OF-307</h1>
      <p style={{marginTop:8}}>slug: <code>{params.brandSlug}</code></p>
    </div>
  );
}
