// Operator-only, idempotent metadata backfill. Defaults to a read-only preview.
function globalKey(data) {
  if (data.brand_id) return null;
  if (typeof data.language !== 'string' || !/^(?:[a-z]{2}(?:-[a-z]{2})?|[a-z]{3})$/i.test(data.language)) throw Error('Global cookie text has an invalid language');
  return data.language.toLowerCase();
}
async function backfill(db, apply = false) {
  const snapshot = await db.collection('cookie_texts').get();
  const pending = [];
  for (const doc of snapshot.docs) {
    const data = doc.data(), key = globalKey(data);
    if (key && data.global_locale_key !== key) pending.push({id:doc.id,key});
  }
  if (apply) for (const item of pending) {
    const ref = db.collection('cookie_texts').doc(item.id);
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists || globalKey(current.data()) !== item.key) throw Error('Cookie scope changed; rerun preview before applying');
      tx.update(ref, {global_locale_key:item.key});
    });
  }
  return {mode:apply?'apply':'preview',pending:pending.length,recordIds:pending.map(item=>item.id)};
}
async function main() {
  const args=process.argv.slice(2),project=args[args.indexOf('--project')+1];
  if (!args.includes('--project') || project!=='orderfly-39325') throw Error('Explicit --project orderfly-39325 is required');
  const raw=process.env.FB_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw Error('Run in the trusted Firebase operator environment with existing Admin credentials');
  let account=JSON.parse(raw.trim().replace(/^(['"])([\s\S]*)\1$/,'$2'));
  if(account.project_id!==project)throw Error('Service account project does not match production data project');
  account.private_key=account.private_key.replace(/\\n/g,'\n');
  const admin=require('firebase-admin');
  const app=admin.initializeApp({credential:admin.credential.cert(account),projectId:project},'cookie-index-backfill');
  try { console.log(JSON.stringify(await backfill(app.firestore(),args.includes('--apply')),null,2)); }
  finally {await app.delete();}
}
module.exports={globalKey,backfill};
if(require.main===module)main().catch(()=>{console.error('Backfill failed. Verify the project, operator credentials, record languages and concurrent changes; no text content was logged.');process.exitCode=1;});
