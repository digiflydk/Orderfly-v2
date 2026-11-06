const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const sharp=require('sharp');
const {generateMenuThumbnails,THUMB_SIZE}=require('../../scripts/esmeralda-menu-thumbnails.cjs');

test('192px menu image generator preserves transparent canvas and is repeatable', async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'esmeralda-thumbnails-'));
 try {
  const original=path.join(dir,'pizza-test.webp'),thumbnail=path.join(dir,'pizza-test-192.webp');
  await sharp({create:{width:960,height:960,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
    .composite([{input:{create:{width:650,height:650,channels:4,background:{r:220,g:130,b:60,alpha:255}}},left:155,top:155}])
    .webp({quality:82}).toFile(original);
  const first=await generateMenuThumbnails(dir);
  assert.equal(first.generated,1);assert.equal(first.unchanged,0);
  const metadata=await sharp(thumbnail).metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.width,THUMB_SIZE);assert.equal(metadata.height,THUMB_SIZE);
  assert.equal(metadata.hasAlpha,true);assert.ok((await fs.stat(thumbnail)).size < 20_000);
  const {data,info}=await sharp(thumbnail).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(data[3],0,'outer transparent border stays intact');
  assert.ok(data[(96*info.width+96)*info.channels+3]>=240,'opaque product remains visible');
  const before=await fs.readFile(thumbnail);
  const second=await generateMenuThumbnails(dir);
  assert.equal(second.generated,0);assert.equal(second.unchanged,1);
  assert.deepEqual(await fs.readFile(thumbnail),before);
  await new Promise(resolve=>setTimeout(resolve,12));
  await sharp({create:{width:960,height:960,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).webp().toFile(original+'.new');
  await fs.rename(original+'.new',original);
  const third=await generateMenuThumbnails(dir);
  assert.equal(third.generated,1,'changed source replaces stale thumbnail');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
