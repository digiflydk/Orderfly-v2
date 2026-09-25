const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

// Exercise the actual draft schema without booting Firebase or sending a prize.
const source = pathToFileURL(path.resolve('src/lib/games/scratch-card.ts')).href;
function validate(payload) {
  const script = `import(${JSON.stringify(source)}).then(m=>process.stdout.write(JSON.stringify(m.scratchCardDraftSchema.safeParse(${JSON.stringify(payload)}).success)))`;
  return JSON.parse(execFileSync(process.execPath,['--no-warnings','--experimental-strip-types','--input-type=module','-e',script],{encoding:'utf8'}));
}
const base = {brandId:'brand_a',title:'Skrab her',instruction:'Afslør resultatet',revealText:'Testresultat',placement:'selected',paths:['/menu']};
test('a selected placement requires at least one explicit page',()=>{
  assert.equal(validate({...base,paths:[]}),false);
  assert.equal(validate(base),true);
});
test('page paths reject external URLs, double slashes and duplicates',()=>{
  for (const paths of [['https://example.com'],['//other'],['/menu','/menu'],['/menu?token=x']])
    assert.equal(validate({...base,paths}),false);
});
test('configured odds and winner caps cannot exceed campaign limits',()=>{
  const settings={...base,cardsPerPlay:3,totalCardLimit:50,prizes:[
    {name:'Dessert',type:'item',value:0,probabilityPercent:60,maxWinners:20},
    {name:'Rabat',type:'percent',value:10,probabilityPercent:41,maxWinners:20},
  ]};
  assert.equal(validate(settings),false);
  assert.equal(validate({...settings,prizes:[{...settings.prizes[0],probabilityPercent:10,maxWinners:51}]}),false);
  assert.equal(validate({...settings,prizes:[{...settings.prizes[0],probabilityPercent:10,maxWinners:20}]}),true);
  assert.equal(validate({...settings,cardsPerPlay:7}),false);
});
