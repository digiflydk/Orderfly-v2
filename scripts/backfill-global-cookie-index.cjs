// Operator-only, idempotent metadata backfill. Defaults to a read-only preview.
const {createHash} = require('node:crypto');
const fs = require('node:fs');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function fingerprint(doc) {
  // Firestore updateTime changes on every write, including a change followed by a revert.
  const version = doc.updateTime ? {seconds:doc.updateTime.seconds,nanoseconds:doc.updateTime.nanoseconds} : doc.data();
  return createHash('sha256').update(JSON.stringify(canonical(version))).digest('hex');
}
function globalKey(data) {
  if (data.brand_id) return null;
  if (typeof data.language !== 'string' || !/^(?:[a-z]{2}(?:-[a-z]{2})?|[a-z]{3})$/i.test(data.language)) throw Error('Global cookie text has an invalid language');
  return data.language.toLowerCase();
}
async function backfill(db, apply = false, reviewedManifest) {
  const snapshot = await db.collection('cookie_texts').get();
  const pending = [];
  for (const doc of snapshot.docs) {
    const data = doc.data(), key = globalKey(data);
    if (key && data.global_locale_key !== key) pending.push({id:doc.id,key,fingerprint:fingerprint(doc)});
  }
  pending.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const manifest = {version:1,project:'orderfly-39325',records:pending};
  if (apply && JSON.stringify(canonical(reviewedManifest)) !== JSON.stringify(canonical(manifest))) {
    throw Error('Reviewed manifest missing or records changed; rerun and review preview before applying');
  }
  if (apply) for (const item of pending) {
    const ref = db.collection('cookie_texts').doc(item.id);
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists || globalKey(current.data()) !== item.key || fingerprint(current) !== item.fingerprint) throw Error('Cookie record or scope changed; rerun preview before applying');
      tx.update(ref, {global_locale_key:item.key});
    });
  }
  return {mode:apply?'apply':'preview',pending:pending.length,recordIds:pending.map(item=>item.id),manifest};
}
async function main() {
  const args=process.argv.slice(2),project=args[args.indexOf('--project')+1];
  if (!args.includes('--project') || project!=='orderfly-39325') throw Error('Explicit --project orderfly-39325 is required');
  const manifestPath=args.includes('--manifest') ? args[args.indexOf('--manifest')+1] : undefined;
  if(args.includes('--apply') && (!manifestPath || manifestPath.startsWith('--'))) throw Error('Apply requires --manifest from a reviewed preview');
  const raw=process.env.FB_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw Error('Run in the trusted Firebase operator environment with existing Admin credentials');
  let account=JSON.parse(raw.trim().replace(/^(['"])([\s\S]*)\1$/,'$2'));
  if(account.project_id!==project)throw Error('Service account project does not match production data project');
  account.private_key=account.private_key.replace(/\\n/g,'\n');
  const admin=require('firebase-admin');
  const app=admin.initializeApp({credential:admin.credential.cert(account),projectId:project},'cookie-index-backfill');
  try {
    const apply=args.includes('--apply');
    const reviewed=apply ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : undefined;
    const result=await backfill(app.firestore(),apply,reviewed);
    // Exclusive creation avoids accidentally overwriting an already reviewed manifest.
    if(!apply && manifestPath) fs.writeFileSync(manifestPath,JSON.stringify(result.manifest,null,2),{mode:0o600,flag:'wx'});
    const {manifest,...summary}=result;
    console.log(JSON.stringify(summary,null,2));
  }
  finally {await app.delete();}
}
module.exports={globalKey,backfill};
if(require.main===module)main().catch(()=>{console.error('Backfill failed. Verify the project, operator credentials, record languages and concurrent changes; no text content was logged.');process.exitCode=1;});
