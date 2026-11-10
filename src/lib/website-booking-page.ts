/** Replace the captured inline implementation with the maintained booking asset. */
export function insertWebsiteBooking(html: string): string {
  if (!html.includes('id="esmeralda-direct-booking"')) throw new Error('Booking mount missing');
  let matches = 0;
  const result = html.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (tag, body: string) => {
    if (!body.includes("const root = document.getElementById('esmeralda-direct-booking')")) return tag;
    matches++;
    return '<script src="/_booking/flow.js" defer></script>';
  });
  if (matches !== 1) throw new Error('Expected one captured booking implementation');
  // The captured global footer suppresses its booking CTA only on the old URL.
  // All three steps share the same mount, including browser history transitions.
  return result.replace("location.pathname.replace(/\\/$/,'')==='/bordbooking'", "document.getElementById('esmeralda-direct-booking')");
}
