const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const CONSENT='/_assets/website-consent.js';
// The consent adapter shipped before GTM-PK4J8ZFD (scripts/preview-gtm-orderfly.cjs), pinned by
// manifest.gtm_orderfly.previous_consent_sha256. Only this explicit change can be reversed: the
// adapter asset and its inline copy on /, so older baselines still pin every other byte.
const previous=fs.readFileSync(require('node:path').join(__dirname,'../fixtures/website-consent-before-gtm-orderfly.js'));
function gtmOrderflyBaseline(route,body,manifest){
 const gtm=manifest.gtm_orderfly;
 if(!gtm||(route!==CONSENT&&route!=='/'))return body;
 assert.equal(hash(previous),gtm.previous_consent_sha256,'pinned previous consent adapter');
 if(route===CONSENT){assert.equal(hash(body),gtm.consent_sha256);return previous;}
 const html=body.toString('utf8'),current=fs.readFileSync(require('node:path').join(__dirname,'../../preview/esmeralda/adapters/website-consent.js'));
 assert.equal(hash(current),gtm.consent_sha256);
 const inline=`<script data-website-consent-owner="inline-v1" data-consent-sha256="${gtm.consent_sha256}">${current.toString('utf8')}</script>`;
 assert.equal(html.split(inline).length,2,'one current inline consent owner on /');
 return Buffer.from(html.replace(inline,()=>`<script data-website-consent-owner="inline-v1" data-consent-sha256="${gtm.previous_consent_sha256}">${previous.toString('utf8')}</script>`));
}
module.exports={gtmOrderflyBaseline};
