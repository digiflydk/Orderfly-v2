'use strict';

/** Resolve the source asset of a direct image request or Next's /_next/image optimizer. */
function menuImageKindFromRequest(requestUrl) {
  if (typeof requestUrl !== 'string' || !requestUrl) return null;
  try {
    const request = new URL(requestUrl, 'https://esmeralda.orderfly.dk');
    const source = request.pathname === '/_next/image'
      ? request.searchParams.get('url') : request.pathname;
    if (!source) return null;
    const asset = new URL(source, 'https://esmeralda.orderfly.dk');
    const path = asset.pathname;
    if (!/^\/images\/esmeralda-v2\/menu\/[a-zA-Z0-9_-]+\.webp$/.test(path)) return null;
    return path.endsWith('-192.webp') ? 'thumb' : 'full';
  } catch {
    return null;
  }
}

module.exports = {menuImageKindFromRequest};
