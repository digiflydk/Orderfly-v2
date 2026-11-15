// Retired website routes: still pinned in the payload, but answered with a permanent redirect and left out of the sitemap.
const {loadTs}=require('./load-ts.cjs');
const {WEBSITE_REDIRECTS}=loadTs('src/lib/website-redirects.ts');
const sitemapUrls=discovery=>discovery.public_urls.filter(url=>!Object.hasOwn(WEBSITE_REDIRECTS,new URL(url).pathname));
module.exports={WEBSITE_REDIRECTS,sitemapUrls};
