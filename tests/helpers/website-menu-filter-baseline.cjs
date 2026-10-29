const assert=require('node:assert/strict'),crypto=require('node:crypto');
// Only the explicit /menu repair can be reversed. The original source hash
// prevents this allowance from masking unrelated changes in legacy baselines.
function menuFilterBaseline(route,body,manifest){
 if(route!=='/menu'||!manifest.menu_filter_accessibility)return body;
 let html=body.toString();
 const styles=html.match(/<style data-menu-filter-accessibility="v1">[^<]*<\/style>/g)||[];
 assert.equal(styles.length,1);html=html.replace(styles[0],'');
 const fixed='<button type="button" fs-cmsfilter-element="clear" class="all-text-wrapper"><span class="text-size-medium">all</span></button>';
 assert.equal(html.split(fixed).length,2);
 html=html.replace(fixed,'<div fs-cmsfilter-element="clear" class="all-text-wrapper"><div class="text-size-medium">all</div></div>');
 const forms=html.match(/<form id="wf-form-Dish-category"[^>]*>/g)||[];assert.equal(forms.length,1);assert.ok(!forms[0].includes('data-turnstile-sitekey'));
 html=html.replace(forms[0],forms[0].slice(0,-1)+' data-turnstile-sitekey="0x4AAAAAAAQTptj2So4dx43e">');
 const original=Buffer.from(html);
 assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'6e2ad876a89f0e017838ab98c6048d39ad3da0c389084f19c4e9967e96efec59');
 return original;
}
module.exports={menuFilterBaseline};
