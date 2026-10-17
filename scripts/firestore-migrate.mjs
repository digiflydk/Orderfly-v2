// Runs one reviewed data migration from scripts/migrations/ against the production data project.
// Used by the manual GitHub workflow "Firestore data migration"; the contract is in
// scripts/migrations/README.md.
// preview: plans the changes, prints them and their manifest hash; writes nothing.
// apply:   plans again, refuses unless the manifest hash equals the reviewed MANIFEST_SHA256,
//          applies each item and logs the run in dataMigrationAudit.
// Usage: node scripts/firestore-migrate.mjs <name> preview|apply
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const AUDIT_COLLECTION = 'dataMigrationAudit';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const manifestSha256 = manifest => createHash('sha256').update(JSON.stringify(canonical(manifest))).digest('hex');

export function migrationFile(name) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(name || '')) throw new Error('A migration name is lowercase letters, digits and dashes.');
  return new URL(`./migrations/${name}.mjs`, import.meta.url);
}

export async function runMigration({ db, name, migration, project, apply, expectedSha256, run }) {
  if (typeof migration.plan !== 'function' || typeof migration.applyItem !== 'function') throw new Error(`${name} must export plan(db) and applyItem(db, item).`);
  const items = await migration.plan(db);
  if (!Array.isArray(items)) throw new Error(`${name}: plan(db) must return an array.`);
  const manifest = { version: 1, migration: name, project, items };
  const hash = manifestSha256(manifest);
  if (!apply) return { mode: 'preview', items: items.length, manifestSha256: hash, manifest };
  if (hash !== expectedSha256) throw new Error(`Planned changes differ from the reviewed preview (now ${hash}). Run a new preview and review it.`);
  if (!items.length) return { mode: 'apply', applied: 0, manifestSha256: hash };

  const audit = db.collection(AUDIT_COLLECTION).doc();
  await audit.set({ migration: name, project, manifestSha256: hash, items: items.length, applied: 0, status: 'started', run, startedAt: new Date().toISOString() });
  let applied = 0;
  try {
    for (const item of items) { await migration.applyItem(db, item); applied++; }
  } catch (error) {
    await audit.update({ status: 'failed', applied, error: String(error.message).slice(0, 500), finishedAt: new Date().toISOString() });
    throw new Error(`Stopped after ${applied} of ${items.length} item(s): ${error.message}`);
  }
  await audit.update({ status: 'completed', applied, finishedAt: new Date().toISOString() });
  return { mode: 'apply', applied, manifestSha256: hash, auditId: audit.id };
}

async function main(name, mode) {
  if (!['preview', 'apply'].includes(mode)) throw new Error('Usage: node scripts/firestore-migrate.mjs <name> preview|apply');
  const file = migrationFile(name);
  if (!existsSync(file)) throw new Error(`No migration scripts/migrations/${name}.mjs.`);
  const { PROJECT, firestore, principal } = await import('./firestore-credentials.mjs');
  console.log(`account   ${principal()}, target project ${PROJECT}`);
  const migration = await import(file);
  if (migration.description) console.log(`migration ${name}: ${migration.description}`);
  const run = process.env.GITHUB_RUN_ID
    ? { url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, commit: process.env.GITHUB_SHA, actor: process.env.GITHUB_TRIGGERING_ACTOR || process.env.GITHUB_ACTOR }
    : { local: true };
  const result = await runMigration({ db: firestore(), name, migration, project: PROJECT, apply: mode === 'apply', expectedSha256: process.env.MANIFEST_SHA256, run });
  if (result.mode === 'preview') {
    console.log(JSON.stringify(result.manifest.items, null, 2));
    console.log(`${result.items} planned change(s). To apply, run the workflow from main with mode apply and manifest_sha256 ${result.manifestSha256}`);
  } else {
    console.log(result.applied ? `Applied ${result.applied} change(s); audit ${AUDIT_COLLECTION}/${result.auditId}.` : 'Nothing to apply.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2], process.argv[3]).then(() => process.exit(process.exitCode || 0), error => { console.error(error.message); process.exit(1); });
}
