const {reverseLandingRepairs}=require('../../scripts/website-landing-repairs.cjs');
const {reverseSeoMeta}=require('../../scripts/website-seo-meta.cjs');
const {reverseContentFixes}=require('../../scripts/website-content-fixes.cjs');
// Reverses only the later, separately pinned page changes (newest first): the content fixes
// (scripts/website-content-fixes.cjs), the SEO metadata
// (scripts/website-seo-meta.cjs), then the landing repairs (scripts/website-landing-repairs.cjs),
// so older pinned baselines still compare every other byte. Non-HTML entries were not changed.
function landingBaseline(route,body,manifest){
 if(!manifest.routes[route]?.file.endsWith('.html'))return body;
 let html=body.toString('utf8');
 if(manifest.content_fixes)html=reverseContentFixes(route,html);
 if(manifest.seo_meta)html=reverseSeoMeta(route,html);
 if(manifest.landing_repairs)html=reverseLandingRepairs(route,html);
 return Buffer.from(html);
}
module.exports={landingBaseline};
