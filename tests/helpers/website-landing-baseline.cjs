const {reverseLandingRepairs}=require('../../scripts/website-landing-repairs.cjs');
// Reverses only the landing repairs (scripts/website-landing-repairs.cjs) so older pinned
// baselines still compare every other byte. Non-HTML entries were not changed by them.
function landingBaseline(route,body,manifest){
 if(!manifest.landing_repairs||!manifest.routes[route]?.file.endsWith('.html'))return body;
 return Buffer.from(reverseLandingRepairs(route,body.toString('utf8')));
}
module.exports={landingBaseline};
