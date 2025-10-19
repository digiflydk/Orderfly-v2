export async function GET() {
  const safe = {
    NODE: process.version,
    PREVIEW: process.env.NEXT_PUBLIC_M3_PREVIEW ?? "(unset)",
  };
  
  return new Response(JSON.stringify(safe, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
