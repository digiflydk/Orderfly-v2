// Standard texts for consent and terms: templates, placeholders, conditions,
// publishing versions, the consent log and the admin preview against the portal.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTs}=require('../helpers/load-ts.cjs');
const {memoryDb}=require('../helpers/marketing-db.cjs');

let db;
const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}};
const texts=loadTs('src/lib/loyalty/stamp-card/texts.ts');
const admin=loadTs('src/lib/loyalty/stamp-card/admin.ts',mocks);
const m=loadTs('src/lib/loyalty/stamp-card/membership.ts',mocks);
const {defaultProgramSettings}=loadTs('src/lib/loyalty/stamp-card/rules.ts');
const {principalKey}=loadTs('src/lib/access/authority.ts',mocks);

const NOW=Date.parse('2026-10-20T10:00:00Z'),S='orderfly.stamp_cards:';
const who=name=>({identity:{provider:'firebase',subject:name},name:name[0].toUpperCase()+name.slice(1)});
const BRAND_DATA={name:'Esmeralda',slug:'esmeralda',companyName:'Esmeralda Pizza ApS',street:'Vestergade 1',zipCode:'8000',city:'Aarhus C',country:'DK',
  companyRegNo:'12345678',supportEmail:'club@esmeralda.dk',privacyUrl:'https://esmeralda.dk/privatliv'};
const TEMPLATE=texts.CURRENT_TEMPLATE.texts;
const full=(changes={})=>({...defaultProgramSettings('Esmeralda'),name:'Esmeralda Club',reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},
  rewardDescription:'Gratis pizza',...TEMPLATE,...changes});
const rows=prefix=>[...db.rows].filter(([p])=>p.startsWith(prefix+'/')).map(([p,v])=>({id:p.split('/')[1],...v}));
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code||(console.error(e),false));

function setup({brand=BRAND_DATA,locations=['l1','l2']}={}){
  db=memoryDb();
  const id=name=>principalKey(who(name).identity);
  db.rows.set('platformAdminControl/access-v1',{
    principals:['admin','fremmed'].map(n=>({id:id(n),active:true})),
    companies:[{id:'esmeralda',name:'Esmeralda',active:true,locationIds:locations,orderflyBrandIds:['brand'],opsflyOrganizationId:null},
      {id:'andet',name:'Andet',active:true,locationIds:[],orderflyBrandIds:['brand2'],opsflyOrganizationId:null}],
    roles:[{id:'admin',name:'Admin',companyId:'esmeralda',kind:'company_user',active:true,permissions:[S+'settings',S+'members']},
      {id:'andet-admin',name:'Admin',companyId:'andet',kind:'company_user',active:true,permissions:[S+'settings']}],
    memberships:[{id:'m1',principalId:id('admin'),companyId:'esmeralda',locationIds:null,roleIds:['admin'],active:true},
      {id:'m2',principalId:id('fremmed'),companyId:'andet',locationIds:null,roleIds:['andet-admin'],active:true}]});
  db.rows.set('brands/brand',{...brand});
  db.rows.set('brands/brand2',{...BRAND_DATA,name:'Andet',slug:'andet',companyName:'Andet ApS',companyRegNo:'87654321'});
  for(const l of locations)db.rows.set('locations/'+l,{brandId:'brand',name:l,isActive:true});
  db.rows.set('products/pizza',{brandId:'brand',productName:'Pizza'});
}
const save=async(settings,actor='admin')=>{
  const version=(db.rows.get('loyaltyPrograms/brand')?.version)??0;
  const input=admin.saveSettingsSchema.parse({brandId:'brand',version,settings});
  return admin.saveSettings(db,who(actor),input,NOW);
};
const portal=async()=>m.programForPortal(db,await m.resolveBrand(db,'esmeralda'));
const ctx={ip:'203.0.113.7',now:NOW};

// ---------- Pure rendering ----------

test('the standard template is valid, fully filled with the brand and settings and leaves no placeholder',()=>{
  for(const field of texts.TEXT_FIELDS)assert.equal(texts.checkTemplate(TEMPLATE[field]),null,field);
  const values=texts.textValues({brand:BRAND_DATA,settings:full({minimumAmountOre:9950}),activeLocations:2,version:3,effectiveFrom:NOW});
  const result=texts.renderProgramTexts(full(),values);
  assert.deepEqual(result.missing,[]);assert.deepEqual(result.invalid,[]);
  for(const field of texts.TEXT_FIELDS)assert.doesNotMatch(result.texts[field],/[{}]/,field);
  const terms=result.texts.terms;
  assert.match(terms,/Esmeralda Club drives af Esmeralda Pizza ApS, Vestergade 1, 8000 Aarhus C, CVR-nr\. 12345678 \("Esmeralda", "vi"\)\. Du kan kontakte os på club@esmeralda\.dk\./);
  assert.match(terms,/Du får ét stempel, hver gang du køber for mindst 99,50 kr\. hos Esmeralda\./);
  assert.match(terms,/samlet 8 stempler, får du gratis pizza, og/);
  assert.match(terms,/mindst 15 år/);assert.match(terms,/inden for 6 måneder/);assert.match(terms,/gyldig i 3 måneder/);
  assert.match(terms,/Version 3, gældende fra 20\. oktober 2026\.$/);
  assert.match(result.texts.consentHelp,/privatlivspolitik \(https:\/\/esmeralda\.dk\/privatliv\)/);
  assert.equal(result.texts.termsAccept,'Jeg accepterer vilkårene for Esmeralda Club.');
  // Approved wording for section 8 (owner, 2026-10-19): no fixed deletion period.
  assert.match(terms,/Lukker vi dit medlemskab eller programmet, bliver medlemskabet deaktiveret\./);
  assert.doesNotMatch(terms,/opbevaring|senest .* måneder efter/);
});

test('conditional sections follow the settings and leave no empty line behind',()=>{
  const render=(changes,locations)=>texts.renderProgramTexts(full(changes),texts.textValues({brand:BRAND_DATA,settings:full(changes),activeLocations:locations,version:1,effectiveFrom:NOW})).texts.terms;
  const on=render({discountedOrdersQualify:true},2),off=render({discountedOrdersQualify:false},2);
  assert.match(on,/giver også stempler\./);assert.doesNotMatch(on,/kampagnetilbud giver ikke stempler/);
  assert.match(off,/kampagnetilbud giver ikke stempler\./);assert.doesNotMatch(off,/giver også stempler/);
  const many='kan bruges i alle Esmeraldas restauranter.';
  assert.ok(render({crossLocation:true},2).includes(many));
  assert.ok(!render({crossLocation:true},1).includes(many),'one location');
  assert.ok(!render({crossLocation:false},2).includes(many),'not across locations');
  for(const text of [on,off,render({crossLocation:false},1)])assert.doesNotMatch(text,/\n\n\n/);
  assert.ok(on.includes('andre udbydere giver ikke stempler.\nKøb med rabatkode eller kampagnetilbud giver også stempler.\n\nDu skal vise'));
  assert.ok(off.includes('andre udbydere giver ikke stempler.\nKøb med rabatkode eller kampagnetilbud giver ikke stempler.\n\nDu skal vise'));
  assert.match(render({crossLocation:false},1),/tilbud\.\n\n5\. Udløb/);
  // Stamps per purchase above one changes the sentence; one keeps the approved wording.
  assert.match(render({stampsPerPurchase:2},2),/\n3\. Sådan optjener du stempler\nDu får 2 stempler, hver gang du køber for mindst 100 kr\./);
  assert.doesNotMatch(render({stampsPerPurchase:2},2),/ét stempel, hver gang/);
  assert.match(render({stampsPerPurchase:1},2),/\nDu får ét stempel, hver gang du køber/);
  // The channel sentence follows the channels that give stamps; both keep the approved wording.
  const both='Stempler gives ved køb i restauranten og ved takeaway, som du bestiller direkte hos os. Køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.';
  assert.ok(render({},2).includes('\n\n'+both+'\n'));
  const dineIn=render({counterChannels:['dine_in'],orderTypes:[]},2);
  assert.ok(dineIn.includes('\n\nStempler gives ved køb i restauranten. Takeaway og køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.\nKøb med rabatkode'));
  assert.ok(!dineIn.includes(both));
  for(const changes of [{counterChannels:['takeaway'],orderTypes:[]},{counterChannels:[],orderTypes:['pickup']}])
    assert.ok(render(changes,2).includes('\n\nStempler gives ved takeaway, som du bestiller direkte hos os. Køb i restauranten og køb via Wolt, Uber Eats og andre udbydere giver ikke stempler.\nKøb med rabatkode'),JSON.stringify(changes));
  assert.ok(render({counterChannels:['dine_in'],orderTypes:['delivery']},2).includes(both));
  // A daily limit is stated after the stamp rule, only when it is set.
  assert.match(render({maxStampsPerDay:2},2),/efter eventuel rabat\. Du kan højst få 2 stempler pr\. dag\.\n/);
  assert.match(render({maxStampsPerDay:null},2),/efter eventuel rabat\.\n/);
});

test('every unfillable placeholder is reported and the template rules reject typos',()=>{
  for(const [field,placeholder] of [['companyName','virksomhed_navn'],['street','virksomhed_adresse'],['zipCode','virksomhed_adresse'],['companyRegNo','cvr'],
    ['supportEmail','kontakt_email'],['privacyUrl','privatlivspolitik_url'],['name','brand_navn']]){
    const result=texts.renderProgramTexts(full(),texts.textValues({brand:{...BRAND_DATA,[field]:''},settings:full(),activeLocations:1,version:1,effectiveFrom:NOW}));
    assert.ok(result.missing.some(x=>x.placeholder===placeholder),field);
  }
  const noReward=texts.renderProgramTexts(full({rewardDescription:''}),texts.textValues({brand:BRAND_DATA,settings:full({rewardDescription:''}),activeLocations:1,version:1,effectiveFrom:NOW}));
  assert.deepEqual(noReward.missing.map(x=>x.placeholder),['belønning']);
  assert.match(texts.checkTemplate('CVR {cvr_nr}'),/Ukendt pladsholder: \{cvr_nr\}/);
  assert.match(texts.checkTemplate('{#hvis rabat_giver_stempel}tekst'),/samme linje/);
  assert.match(texts.checkTemplate('{#hvis rabat_giver_stempel}a\nb{/hvis}'),/samme linje/);
  assert.match(texts.checkTemplate('{/hvis}'),/mangler/);
  assert.match(texts.checkTemplate('{#hvis ukendt}a{/hvis}'),/Ukendt/);
  assert.match(texts.checkTemplate('a { b'),/krøllet parentes/);
  assert.match(texts.checkTemplate('{#hvis flere_afdelinger}{#hvis rabat_giver_stempel}a{/hvis}{/hvis}'),/inde i et andet/);
  assert.equal(texts.checkTemplate('Ingen pladsholdere her.'),null);
  // Own free text without placeholders renders as it is.
  assert.equal(texts.renderTemplate('Egne vilkår.',texts.textValues({brand:{},settings:full(),activeLocations:0,version:null,effectiveFrom:null})).text,'Egne vilkår.');
});

test('a published template version never changes; the brand copy is matched to it',()=>{
  // Locked hashes: changing a released version must be a new entry in TEMPLATE_VERSIONS.
  const LOCKED={'stamp-card-da-2026-10-19':'0f3cb9b3'};
  for(const t of texts.TEMPLATE_VERSIONS){
    const hash=createHash('sha256').update(JSON.stringify(texts.TEXT_FIELDS.map(f=>t.texts[f]))).digest('hex').slice(0,8);
    assert.equal(hash,LOCKED[t.version],t.version);
  }
  assert.equal(texts.matchingTemplateVersion(TEMPLATE),texts.CURRENT_TEMPLATE.version);
  assert.equal(texts.matchingTemplateVersion({...TEMPLATE,terms:TEMPLATE.terms+' Ekstra.'}),null);
  assert.notEqual(texts.textKey(full()),texts.textKey(full({minimumAmountOre:15000})));
  assert.notEqual(texts.textKey(full()),texts.textKey(full({stampsPerPurchase:2})));
  for(const changes of [{counterChannels:['dine_in']},{orderTypes:[]},{maxStampsPerDay:3}])assert.notEqual(texts.textKey(full()),texts.textKey(full(changes)),JSON.stringify(changes));
  assert.equal(texts.textKey(full({counterChannels:['dine_in','takeaway']})),texts.textKey(full({counterChannels:['takeaway','dine_in']})));
  assert.equal(texts.textKey(full()),texts.textKey(full({sessionDays:30,counterIdleMinutes:9})));
});

// ---------- Admin, publishing and the portal ----------

test('a new stamp card starts with the standard texts and the brand data for the preview',async()=>{
  setup();
  const view=await admin.readSettings(db,who('admin'),'brand');
  for(const field of texts.TEXT_FIELDS)assert.equal(view.settings[field],TEMPLATE[field]);
  assert.equal(view.textContext.activeLocations,2);
  assert.equal(view.textContext.brand.companyRegNo,'12345678');
  assert.equal(Object.keys(view.textContext.brand).includes('slug'),false);
  await save({...view.settings,reward:{type:'free_product',productIds:['pizza'],categoryIds:[]},rewardDescription:'Gratis pizza'});
  const saved=db.rows.get('loyaltyPrograms/brand');
  assert.equal(saved.texts.templateVersion,texts.CURRENT_TEMPLATE.version);
  assert.equal(saved.texts.version,0,'an inactive draft publishes nothing');
  assert.equal(rows('loyaltyTextVersions').length,0);
});

test('the program cannot be activated while a required placeholder is missing',async()=>{
  setup({brand:{...BRAND_DATA,companyRegNo:'',privacyUrl:''}});
  await save(full());
  const error=await save(full({active:true})).catch(e=>e);
  assert.equal(error.code,'texts_incomplete');
  assert.deepEqual(error.missing.map(x=>x.placeholder).sort(),['cvr','privatlivspolitik_url']);
  assert.deepEqual(error.missing.find(x=>x.placeholder==='cvr').fields,['terms']);
  await rejects(admin.setProgramActive(db,who('admin'),{brandId:'brand',version:1,active:true},NOW),'texts_incomplete');
  assert.equal(db.rows.get('loyaltyPrograms/brand').settings.active,false);
  db.rows.set('brands/brand',{...BRAND_DATA});
  const result=await admin.setProgramActive(db,who('admin'),{brandId:'brand',version:1,active:true},NOW);
  assert.equal(result.textVersion,1);
  const [published]=rows('loyaltyTextVersions');
  assert.equal(published.id,'brand_1');assert.equal(published.effectiveFrom,NOW);assert.equal(published.createdByName,'Admin');
  assert.equal(published.templateVersion,texts.CURRENT_TEMPLATE.version);
  assert.match(published.rendered.terms,/Version 1, gældende fra 20\. oktober 2026\./);
  for(const field of texts.TEXT_FIELDS)assert.doesNotMatch(published.rendered[field],/[{}]/);
});

test('a template with a broken placeholder is never saved, not even as a draft',()=>{
  setup();
  const parsed=admin.saveSettingsSchema.safeParse({brandId:'brand',version:0,settings:full({terms:'CVR {cvr_nummer}'})});
  assert.equal(parsed.success,false);
  assert.deepEqual(parsed.error.issues[0].path,['settings','terms']);
  assert.match(parsed.error.issues[0].message,/Ukendt pladsholder/);
});

test('a changed setting shows at once in the terms and publishes a new version; unrelated settings do not',async()=>{
  setup();
  await save(full({active:true}));
  assert.match((await portal()).terms,/mindst 100 kr\./);
  assert.equal((await save(full({active:true,minimumAmountOre:15000}))).textVersion,2);
  const p=await portal();
  assert.match(p.terms,/mindst 150 kr\./);assert.match(p.terms,/Version 2, gældende fra/);
  assert.equal((await save(full({active:true,minimumAmountOre:15000,sessionDays:90}))).textVersion,2);
  assert.equal(rows('loyaltyTextVersions').length,2);
  // Off and on again with the same texts is the same version.
  await save(full({active:false,minimumAmountOre:15000,sessionDays:90}));
  assert.equal((await admin.listPrograms(db,who('admin'),['brand']))[0].termsChanged,false);
  await save(full({active:false,minimumAmountOre:20000,sessionDays:90}));
  assert.equal((await admin.listPrograms(db,who('admin'),['brand']))[0].termsChanged,true,'activating would publish changed terms');
  await save(full({active:false,minimumAmountOre:15000,sessionDays:90}));
  assert.equal((await save(full({active:true,minimumAmountOre:15000,sessionDays:90}))).textVersion,2);
  assert.equal(db.rows.get('loyaltyPrograms/brand').texts.templateVersion,texts.CURRENT_TEMPLATE.version);
  await save(full({active:true,minimumAmountOre:15000,sessionDays:90,consentHelp:'Egen forklaring.'}));
  assert.equal(db.rows.get('loyaltyPrograms/brand').texts.templateVersion,null,'own text');
  await save(full({active:true,minimumAmountOre:15000,sessionDays:90}));
  assert.equal(db.rows.get('loyaltyPrograms/brand').texts.templateVersion,texts.CURRENT_TEMPLATE.version,'restored');
});

test('the admin preview is exactly what the customer sees',async()=>{
  setup({locations:['l1']});
  await save(full({active:true,discountedOrdersQualify:true}));
  const view=await admin.readSettings(db,who('admin'),'brand'),p=await portal();
  const preview=texts.previewTexts(view.settings,view.texts,view.textContext,NOW+1000);
  assert.deepEqual(preview.missing,[]);
  for(const [field,shown] of [['consentText',p.consentText],['consentHelp',p.consentHelp],['termsAccept',p.termsAccept],['terms',p.terms]])assert.equal(preview.texts[field],shown,field);
  // An unsaved change previews as the next version from today.
  const changed=texts.previewTexts({...view.settings,minimumAmountOre:20000},view.texts,view.textContext,NOW);
  assert.match(changed.texts.terms,/mindst 200 kr\./);assert.match(changed.texts.terms,/Version 2, gældende fra 20\. oktober 2026\./);
});

test('sign-up logs the filled texts the customer saw, with the text version',async()=>{
  setup();
  await save(full({active:true}));
  const brand=await m.resolveBrand(db,'esmeralda'),p=await portal();
  const input={name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,consentVersion:p.consentVersion,termsVersion:p.termsVersion};
  await rejects(m.signup(db,brand,{...input,termsVersion:'terms-old'},ctx),'program_changed');
  await m.signup(db,brand,input,ctx);
  const [member]=rows('loyaltyMembers'),[consent]=rows('marketingConsents');
  assert.equal(member.textVersion,1);
  assert.equal(consent.wording,`${p.consentText}\n\n${p.consentHelp}`);
  assert.equal(consent.version,p.consentVersion);
  const shown=rows('loyaltyRenderedTexts').filter(r=>r.hash===member.textHash);
  assert.equal(shown.length,1);
  assert.equal(shown[0].texts.terms,p.terms);
  const joined=rows('loyaltyEvents').find(e=>e.type==='member_joined');
  assert.deepEqual(joined.result,{textVersion:1,textHash:member.textHash});
  // A changed setting changes the filled text, so the old versions are refused.
  await save(full({active:true,stampsRequired:10}));
  await rejects(m.signup(db,brand,{...input,email:'bo@example.com'},ctx),'program_changed');
});

test('a brand detail removed after launch closes sign-up instead of showing a placeholder',async()=>{
  setup();
  await save(full({active:true}));
  const error=console.error;console.error=()=>{};
  try{
    db.rows.set('brands/brand',{...BRAND_DATA,companyRegNo:''});
    const p=await portal();
    assert.equal(p.active,false);assert.equal(p.terms,'');assert.equal(p.consentText,'');
    const before=await (async()=>{db.rows.set('brands/brand',{...BRAND_DATA});return portal();})();
    db.rows.set('brands/brand',{...BRAND_DATA,companyRegNo:''});
    await rejects(m.signup(db,await m.resolveBrand(db,'esmeralda'),{name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,
      consentVersion:before.consentVersion,termsVersion:before.termsVersion},ctx),'program_inactive');
  }finally{console.error=error;}
});

test('a brand never sees another brand\'s texts or details',async()=>{
  setup();
  await save(full({active:true}));
  await rejects(admin.readSettings(db,who('fremmed'),'brand'),'forbidden');
  await rejects(admin.textVersionDetail(db,who('fremmed'),'brand',1),'forbidden');
  assert.deepEqual(await admin.listTextVersions(db,who('fremmed'),['brand','brand2']),[]);
  const own=await admin.listTextVersions(db,who('admin'),['brand','brand2']);
  assert.deepEqual(own.map(r=>[r.brandId,r.textVersion,r.current]),[['brand',1,true]]);
  const detail=await admin.textVersionDetail(db,who('admin'),'brand',1);
  assert.match(detail.rendered.terms,/Esmeralda Pizza ApS/);assert.doesNotMatch(detail.rendered.terms,/Andet ApS/);
  await rejects(admin.textVersionDetail(db,who('admin'),'brand',7),'text_version_not_found');
  // A version document of another brand under a guessed id is not shown.
  db.rows.set('loyaltyTextVersions/brand_9',{brandId:'brand2',textVersion:9,rendered:detail.rendered});
  await rejects(admin.textVersionDetail(db,who('admin'),'brand',9),'text_version_not_found');
});

test('a member who saw a variant after a brand detail changed is listed under the version',async()=>{
  setup();
  await save(full({active:true}));
  db.rows.set('brands/brand',{...BRAND_DATA,street:'Nørregade 5'});
  const brand=await m.resolveBrand(db,'esmeralda'),p=await portal();
  await m.signup(db,brand,{name:'Anna',email:'anna@example.com',newsletterConsent:true,termsAccepted:true,consentVersion:p.consentVersion,termsVersion:p.termsVersion},ctx);
  const detail=await admin.textVersionDetail(db,who('admin'),'brand',1);
  assert.match(detail.rendered.terms,/Vestergade 1/);
  assert.equal(detail.variants.length,1);assert.match(detail.variants[0].texts.terms,/Nørregade 5/);
  const [row]=await admin.listTextVersions(db,who('admin'),['brand']);
  assert.equal(row.members,1);
});
