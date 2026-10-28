const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('preview/esmeralda/adapters/website-consent.js','utf8');
function fixture(initial={}, origin='https://www.esmeraldapizza.dk') {
 const jar={...initial},timers=new Map(),listeners={},scripts=[],scriptNodes=[],nodes=new Map();let sequence=0,reloads=0;
 const node=()=>({hidden:false,checked:false,attrs:{},classList:{add(){},remove(){}},style:{removeProperty(){}},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];}});
 const choices=['marketing','analytics','personalization'].map(c=>{const n=node();n.attrs['flowappz-cookie-choice']=c;return n;});
 for(const key of ['[flowappz-cookie-consent-container]','[flowappz-cookie-popup]','[flowappz-cookie-settings-wrapper]','[flowappz-cookie-consent-sticky-cookie-button]','[data-newsletter-consent-fallback]','[data-newsletter-consent-message]'])nodes.set(key,node());
 const document={readyState:'complete',querySelector:q=>nodes.get(q),querySelectorAll:q=>q==='[flowappz-cookie-choice]'?choices:[],createElement:()=>node(),head:{append:el=>{scripts.push(el.src);scriptNodes.push(el);}},addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn);}};
 Object.defineProperty(document,'cookie',{get:()=>Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),set:text=>{const [k,v]=text.split(';')[0].split('=');jar[k]=v;}});
 const window={};const context={window,document,location:{origin,reload:()=>{reloads++;}},setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(code,context);
 return {window,jar,scripts,scriptNodes,choices,nodes,reloads:()=>reloads,rerun:()=>vm.runInContext(code,context),flush:()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}},click:command=>{for(const fn of listeners.click||[])fn({preventDefault(){},target:{closest:()=>({getAttribute:()=>command})}});}};
}
test('initial denial, no optional providers, default Google consent before updates',()=>{
 const f=fixture();f.flush();assert.deepEqual(f.scripts,[]);
 const commands=f.window.dataLayer.map(x=>Array.from(x));assert.equal(commands[0][0],'consent');assert.equal(commands[0][1],'default');assert.equal(commands[0][2].ad_storage,'denied');assert.equal(commands[0][2].analytics_storage,'denied');assert.equal(commands[0][2].ad_user_data,'denied');
 assert.equal(f.nodes.get('[data-newsletter-consent-fallback]').hidden,false);
});
test('reject-all ignores checked choices; selected preserves separate categories',()=>{
 const f=fixture();f.choices.forEach(n=>n.checked=true);f.click('reject-all');f.flush();assert.deepEqual(f.scripts,[]);assert.equal(f.jar['fa-consent-ad_storage'],'false');assert.equal(f.jar['fa-consent-analytics_storage'],'false');
 f.choices[0].checked=true;f.click('accept-selected');f.flush();assert.equal(f.scripts.length,2);assert.ok(f.scripts.some(s=>s.includes('facebook')));assert.ok(f.scripts.some(s=>s.includes('omnisnippet')));assert.ok(!f.scripts.some(s=>s.includes('googletagmanager')));
});
test('analytics-only stays saved but mixed Ads GTM is blocked pending category isolation',()=>{
 const f=fixture();f.choices[1].checked=true;f.click('accept-selected');f.flush();assert.equal(f.jar['fa-consent-analytics_storage'],'true');assert.equal(f.jar['fa-consent-ad_storage'],'false');assert.deepEqual(f.scripts,[]);
});
test('accept-all loads each provider once and one Meta PageView despite repeated events/boot',()=>{
 const f=fixture();f.click('accept-all');f.click('accept-all');f.flush();f.rerun();f.click('accept-all');f.flush();assert.equal(f.scripts.length,3);assert.equal(new Set(f.scripts).size,3);
 assert.equal(f.window.fbq.queue.filter(x=>x[0]==='track'&&x[1]==='PageView').length,1);
 assert.equal(f.window.omnisend.filter(x=>x[0]==='track').length,1);
 assert.equal(f.window.dataLayer.filter(x=>x.event==='gtm.js').length,1);
 assert.equal(f.nodes.get('[data-newsletter-consent-fallback]').hidden,true);
});
test('accept then revoke before scheduled work makes zero requests',()=>{
 const f=fixture();f.click('accept-all');f.click('reject-all');f.flush();assert.deepEqual(f.scripts,[]);assert.equal(f.reloads(),0);
});
test('loaded provider revocation persists denial then reloads; next document stays denied',()=>{
 const f=fixture();f.click('accept-all');f.flush();f.click('reject-all');f.flush();assert.equal(f.reloads(),1);assert.equal(f.scripts.length,3);assert.equal(f.window.fbq.queue.at(-1)[1],'revoke');
 const revisit=fixture(f.jar);revisit.flush();assert.deepEqual(revisit.scripts,[]);
});
test('removing analytics with marketing retained reloads loaded Google; no further loader',()=>{
 const f=fixture();f.click('accept-all');f.flush();f.choices[1].checked=false;f.click('accept-selected');f.flush();assert.equal(f.reloads(),1);assert.equal(f.jar['fa-consent-ad_storage'],'true');assert.equal(f.jar['fa-consent-analytics_storage'],'false');assert.equal(f.scripts.length,3);
});
test('saved grant restores once; malformed/incomplete choice and preview origins stay closed',()=>{
 const f=fixture();f.click('accept-all');const revisit=fixture(f.jar);revisit.flush();assert.equal(revisit.scripts.length,3);
 const invalid=fixture({'fa-consent-ad_storage':'true','fa-consent-analytics_storage':'true','fa-consent-security_storage':'false'});invalid.flush();assert.deepEqual(invalid.scripts,[]);
 for(const host of ['https://web.orderfly.dk','http://terminal.local:4173','https://www.esmeraldapizza.dk.evil']){const preview=fixture(f.jar,host);preview.flush();assert.deepEqual(preview.scripts,[]);assert.equal(preview.nodes.get('[data-newsletter-consent-fallback]').hidden,false);}
});
test('provider load failure keeps newsletter fallback visible without repeated loader requests',()=>{
 const f=fixture();f.click('accept-all');f.flush();f.scriptNodes.find(n=>n.src.includes('omnisnippet')).onerror();
 assert.equal(f.nodes.get('[data-newsletter-consent-fallback]').hidden,false);assert.match(f.nodes.get('[data-newsletter-consent-message]').textContent,/kunne ikke indlæses/);
 f.click('accept-all');f.flush();assert.equal(f.scripts.length,3);
});
