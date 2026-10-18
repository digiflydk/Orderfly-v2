// Post-merge gate for live verification: the merge commit must pass CI, and the
// live site must run that commit (or a later main that contains it) before any
// smoke test counts as evidence for it.
const PASSING = new Set(['success', 'skipped', 'neutral']);

async function ciState({ github, owner, repo, sha, self }) {
  const runs = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: sha, per_page: 100 });
  const relevant = runs.filter(run => run.name !== self);
  if (!relevant.length) return { state: 'pending', detail: 'no checks reported yet' };
  const failed = relevant.filter(run => run.status === 'completed' && !PASSING.has(run.conclusion));
  if (failed.length) return { state: 'failed', detail: failed.map(run => `${run.name}: ${run.conclusion}`).join(', ') };
  const open = relevant.filter(run => run.status !== 'completed');
  if (open.length) return { state: 'pending', detail: open.map(run => run.name).join(', ') };
  return { state: 'passed', detail: relevant.map(run => run.name).join(', ') };
}

async function deployedRelease(fetchImpl, liveUrl) {
  try {
    const response = await fetchImpl(new URL('/api/health', liveUrl), { cache: 'no-store' });
    if (!response.ok) return null;
    const body = await response.json();
    return /^[a-f0-9]{40}$/.test(body?.release || '') ? body.release : null;
  } catch {
    return null;
  }
}

// The deployed commit contains the merge when it is the merge or a descendant on main.
async function containsMerge({ github, owner, repo, mergeSha, release }) {
  if (release === mergeSha) return true;
  try {
    const { data } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${mergeSha}...${release}` });
    return data.status === 'ahead' || data.status === 'identical';
  } catch {
    return false;
  }
}

async function waitForRelease({ github, owner, repo, mergeSha, liveUrl, self, log = console.log,
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  timeoutMs = 40 * 60_000, intervalMs = 30_000 }) {
  if (!/^[a-f0-9]{40}$/.test(mergeSha || '')) throw new Error('The merged PR has no merge commit SHA.');
  const deadline = now() + timeoutMs;
  let ci = { state: 'pending', detail: '' }, release = null;
  while (now() < deadline) {
    if (ci.state !== 'passed') {
      ci = await ciState({ github, owner, repo, sha: mergeSha, self });
      if (ci.state === 'failed') throw new Error(`CI failed on merge commit ${mergeSha}: ${ci.detail}`);
    }
    if (ci.state === 'passed') {
      release = await deployedRelease(fetchImpl, liveUrl);
      if (release && await containsMerge({ github, owner, repo, mergeSha, release })) {
        log(`CI passed (${ci.detail}); live runs ${release}, which contains ${mergeSha}.`);
        return { release };
      }
    }
    log(`Waiting: CI ${ci.state}${ci.detail ? ` (${ci.detail})` : ''}; live release ${release || 'unknown'}.`);
    await sleep(intervalMs);
  }
  throw new Error(`Timed out: CI ${ci.state}, live release ${release || 'unknown'}, expected ${mergeSha} or a later main.`);
}

module.exports = { waitForRelease, ciState, containsMerge, deployedRelease };
