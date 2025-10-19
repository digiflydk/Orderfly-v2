export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PageProps = {
  params: Promise<{ brandSlug: string }>;
};

export default async function BrandSafe({ params }: PageProps) {
  const { brandSlug } = await params;
  
  return (
    <div style={{padding:16, fontFamily:'system-ui,sans-serif'}}>
      <h1 style={{fontSize:20,fontWeight:600}}>Brand Safe OK • OF-307</h1>
      <p style={{marginTop:8}}>slug: <code>{brandSlug}</code></p>
    </div>
  );
}
