const {reverseLandingRepairs}=require('../../scripts/website-landing-repairs.cjs');
const {reverseSeoMeta}=require('../../scripts/website-seo-meta.cjs');
// Reverses only the later, separately pinned page changes (newest first): the SEO metadata
// (scripts/website-seo-meta.cjs), then the landing repairs (scripts/website-landing-repairs.cjs),
// so older pinned baselines still compare every other byte. Non-HTML entries were not changed.
function landingBaseline(route,body,manifest){
 if(!manifest.routes[route]?.file.endsWith('.html'))return body;
 let html=body.toString('utf8');
 if(manifest.seo_meta)html=reverseSeoMeta(route,html);
 if(manifest.landing_repairs)html=reverseLandingRepairs(route,html);
 return Buffer.from(html);
}
module.exports={landingBaseline};
