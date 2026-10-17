// Publishes the rules file named in firebase.access.json to the Firestore release of the
// production data project. Used by the manual GitHub workflow "Firestore rules".
// preview: prints the live and candidate hashes and a diff; changes nothing.
// apply:   re-reads the live rules and refuses unless their hash equals the reviewed
//          EXPECTED_LIVE_SHA256, publishes the candidate and verifies the published hash.
// Usage: node scripts/firestore-rules-release.mjs preview|apply
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// Loaded only when run as a script, so the pure checks can be tested without firebase-admin installed.
const { PROJECT, accessToken, principal } = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
  ? await import('./firestore-credentials.mjs') : { PROJECT: 'orderfly-39325' };

export const sha256 = value => createHash('sha256').update(value).digest('hex');

// Apply only on top of exactly the live rules that were reviewed, and never a no-op release.
export function checkApply({ live, candidate, expectedLiveSha256 }) {
  if (!/^[a-f0-9]{64}$/.test(expectedLiveSha256 || '')) throw new Error('Set the live rules hash from the reviewed preview (64 hex characters).');
  if (sha256(live) !== expectedLiveSha256) throw new Error(`Live rules changed since the reviewed preview (now ${sha256(live)}). Run a new preview and review it.`);
  if (sha256(candidate) === sha256(live)) return 'unchanged';
  return 'publish';
}

const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`;
const api = async (token, path, init = {}) => {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) throw new Error(`${path}: HTTP 403 ${body.error?.message || ''}. If the role is missing, grant "Firebase Rules Admin" in ${PROJECT} to ${principal()}.`);
  return { status: res.status, body };
};

async function liveRules(token) {
  const release = await api(token, RELEASE);
  if (release.status === 404) return { exists: false, source: '' };
  if (release.status !== 200) throw new Error(`read release: HTTP ${release.status} ${release.body.error?.message || ''}`);
  const ruleset = await api(token, release.body.rulesetName);
  if (ruleset.status !== 200) throw new Error(`read ruleset: HTTP ${ruleset.status} ${ruleset.body.error?.message || ''}`);
  return { exists: true, source: ruleset.body.source.files.map(file => file.content).join('\n') };
}

async function main(mode) {
  if (!['preview', 'apply'].includes(mode)) throw new Error('Usage: node scripts/firestore-rules-release.mjs preview|apply');
  const file = JSON.parse(readFileSync('firebase.access.json', 'utf8')).firestore.rules;
  const candidate = readFileSync(file, 'utf8');
  const token = await accessToken();
  console.log(`account   ${principal()}, target project ${PROJECT}`);
  const live = await liveRules(token);
  console.log(`live      sha256 ${sha256(live.source)}${live.exists ? '' : ' (no release yet)'}`);
  console.log(`candidate sha256 ${sha256(candidate)} (${file})`);

  if (mode === 'preview') {
    const dir = mkdtempSync(join(tmpdir(), 'rules-'));
    writeFileSync(join(dir, 'live.rules'), live.source);
    const diff = spawnSync('diff', ['-u', '--label', 'live', '--label', file, join(dir, 'live.rules'), file], { encoding: 'utf8' });
    console.log(diff.stdout || 'No differences.');
    console.log(`To publish, run the workflow from main with mode apply and expected_live_sha256 ${sha256(live.source)}`);
    return;
  }

  if (checkApply({ live: live.source, candidate, expectedLiveSha256: process.env.EXPECTED_LIVE_SHA256 }) === 'unchanged') {
    console.log('The candidate is already live; nothing published.');
    return;
  }
  // Creating the ruleset compiles it; a syntax error stops here with Google's message.
  const created = await api(token, `projects/${PROJECT}/rulesets`, { method: 'POST', body: JSON.stringify({ source: { files: [{ name: file, content: candidate }] } }) });
  if (created.status !== 200) throw new Error(`create ruleset: HTTP ${created.status} ${created.body.error?.message || ''}`);
  const release = { name: RELEASE, rulesetName: created.body.name };
  const updated = live.exists
    ? await api(token, RELEASE, { method: 'PATCH', body: JSON.stringify({ release }) })
    : await api(token, `projects/${PROJECT}/releases`, { method: 'POST', body: JSON.stringify(release) });
  if (updated.status !== 200) throw new Error(`publish release: HTTP ${updated.status} ${updated.body.error?.message || ''}`);
  const published = await liveRules(token);
  if (sha256(published.source) !== sha256(candidate)) throw new Error(`Published rules hash ${sha256(published.source)} does not match the candidate.`);
  console.log(`published ${created.body.name}, live sha256 ${sha256(published.source)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
