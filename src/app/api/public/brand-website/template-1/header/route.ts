// The preview-only API is retired. The standard storefront renders its header directly.
export async function GET() {
  return Response.json({error: 'This preview endpoint has been retired. Use the brand takeaway website.'}, {status: 410});
}
