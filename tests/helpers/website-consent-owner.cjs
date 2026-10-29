const assert=require('node:assert/strict'),crypto=require('node:crypto');
/** Identify exactly one owner; inline is allowed only on / and only for the entire pinned adapter. */
function assertConsentOwner(html,route,adapter,manifest){
 const hash=crypto.createHash('sha256').update(adapter).digest('hex');assert.equal(hash,manifest.added_assets['/_assets/website-consent.js'].sha256);
 assert.doesNotMatch(adapter.toString(),/document\.currentScript|<\/script/i);
 const scripts=[...html.matchAll(/<script\b([^>]*)>([^]*?)<\/script>/g)].map(m=>({full:m[0],attrs:m[1],body:m[2]}));
 const owners=scripts.filter(s=>/\bsrc="\/_assets\/website-consent.js"/.test(s.attrs)||/\bdata-website-consent-owner="inline-v1"/.test(s.attrs));assert.equal(owners.length,1,route);
 const owner=owners[0];assert.doesNotMatch(owner.attrs,/\s(?:async|defer)(?:\s|=|$)/);assert.ok(html.includes('<head>'+owner.full),'owner must be first in head');
 if(route==='/'){assert.match(owner.attrs,/data-website-consent-owner="inline-v1"/);assert.doesNotMatch(owner.attrs,/\bsrc=/);assert.deepEqual(Buffer.from(owner.body),adapter);assert.match(owner.attrs,new RegExp('data-consent-sha256="'+hash+'"'));assert.equal(manifest.homepage_bootstrap.consent_sha256,hash);}
 else{assert.match(owner.attrs,/\bsrc="\/_assets\/website-consent.js"/);assert.equal(owner.body,'');}
 return {owner,scripts};
}
module.exports={assertConsentOwner};
