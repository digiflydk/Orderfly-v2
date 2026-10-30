const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {loadTs}=require('../helpers/load-ts.cjs');
const {esmeraldaMenuImage}=loadTs('src/lib/esmeralda-menu-images.ts');
const brand='oeypKaMyYcQjIwaa1PtV', combo='esmeralda-v2-pizzamenu-20261030', soda='f10a57a7-ecfa-4f70-86b0-b0b435120440';
test('menu cutouts remain scoped to V2, brand and approved combo',()=>{
 assert.equal(esmeraldaMenuImage(false,brand,combo,soda),undefined);
 assert.equal(esmeraldaMenuImage(true,'other',combo,soda),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,'other',soda),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,combo,'unknown'),undefined);
 assert.equal(esmeraldaMenuImage(true,brand,combo,soda).illustration,false);
});
test('missing dip photos have existing clearly marked illustration assets',()=>{
 for(const name of ['chili','dressing','pesto']){
  const asset=esmeraldaMenuImage(true,brand,combo,`esmeralda-v2-combo-dip-${name}-20261030`);
  assert.equal(asset.illustration,true);assert.ok(fs.existsSync(`public${asset.src}`));
 }
});
