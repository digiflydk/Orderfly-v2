import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  controlledLiveMode,
  deploymentEvidenceMatches,
  manualIssueNumber,
  missingCiJobs,
  REQUIRED_CI_JOBS,
  selectCleanReview,
  validateDeploymentTimestamp,
} from '../scripts/release-contract.mjs';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('manual release markers and review evidence bind to the exact head', () => {
  assert.equal(manualIssueNumber('Manual-Work-Issue: #20\nControlled-Live-Verification: none'), 20);
  assert.equal(manualIssueNumber('Manual-Work-Issue: #20\nManual-Work-Issue: #21'), null);
  assert.equal(controlledLiveMode('Controlled-Live-Verification: required'), 'required');
  assert.deepEqual(missingCiJobs(REQUIRED_CI_JOBS.map((name) => ({ name, status: 'completed', conclusion: 'success' }))), []);
  const head = 'a'.repeat(40);
  const clean = selectCleanReview([{ author_association: 'OWNER', created_at: '2026-08-25T05:00:00Z', body: `MANUAL_CODE_REVIEW: CLEAN\nReviewed-Head: ${head}` }], head);
  assert.ok(clean);
  assert.equal(selectCleanReview([{ author_association: 'OWNER', created_at: '2026-08-25T05:00:00Z', body: `MANUAL_CODE_REVIEW: CLEAN\nReviewed-Head: ${'b'.repeat(40)}` }], head), null);
});

test('deployment timestamp and evidence are exact-SHA gated', () => {
  const nowMs = Date.parse('2026-08-25T06:00:00Z');
  const mergedAtMs = Date.parse('2026-08-25T05:00:00Z');
  assert.equal(validateDeploymentTimestamp('2026-08-25T05:30:00Z', { nowMs, mergedAtMs }).valid, true);
  assert.equal(validateDeploymentTimestamp('2026-99-40T25:61:61Z', { nowMs, mergedAtMs }).valid, false);
  assert.equal(validateDeploymentTimestamp('2026-08-25T06:00:01Z', { nowMs, mergedAtMs }).valid, false);
  assert.equal(validateDeploymentTimestamp('2026-08-25T04:59:59Z', { nowMs, mergedAtMs }).valid, false);
  const sha = 'c'.repeat(40);
  assert.equal(deploymentEvidenceMatches(`DEPLOYMENT_SUCCEEDED\nMerge-SHA: ${sha}\nDeployment-Run: 123`, sha, '123'), true);
});

test('checked-in workflows implement MANUAL_NO_API_MODE and deployment-aware finalization', async () => {
  const [quality, deploy, live, ci, liveConfig, normalConfig, agents, development, deployment] = await Promise.all([
    source('.github/workflows/work-quality-gate.yml'),
    source('.github/workflows/work-deployment-evidence.yml'),
    source('.github/workflows/work-live-verification.yml'),
    source('.github/workflows/ui-tests.yml'),
    source('playwright.live.config.ts'),
    source('playwright.config.ts'),
    source('AGENTS.md'),
    source('docs/development-workflow.md'),
    source('docs/deployment-flow.md'),
  ]);

  for (const body of [quality, deploy, live, agents, development, deployment]) {
    assert.doesNotMatch(body, /OPENAI_API_KEY|openai\/codex-action/i);
  }
  assert.doesNotMatch(quality, /READY FOR PO|PO_ACCEPTED|Awaiting PO acceptance/i);
  assert.match(quality, /\[READY FOR RELEASE\]/);
  assert.match(quality, /MANUAL_CODE_REVIEW/);
  assert.match(quality, /pulls\.merge/);
  assert.match(quality, /Persistent release lock/);
  assert.match(quality, /Firebase App Hosting automatic rollout/);
  assert.doesNotMatch(quality, /LIVE_VERIFICATION_PASSED|\[DONE\]/);

  assert.match(deploy, /APP_HOSTING_ROLLOUT_CONFIRMED/);
  assert.match(deploy, /orderfly-v21-10334086-b3076/);
  assert.match(deploy, /orderfly-39325/);
  assert.match(deploy, /Rollout-Commit/);
  assert.match(deploy, /validateDeploymentTimestamp/);
  assert.match(deploy, /DEPLOYMENT_SUCCEEDED/);
  assert.match(deploy, /work-live-verify/);

  assert.match(live, /repository_dispatch/);
  assert.match(live, /work-live-verify/);
  assert.doesNotMatch(live, /pull_request_target|types:\s*\[closed\]/);
  assert.match(live, /DEPLOYMENT_SUCCEEDED/);
  assert.match(live, /LIVE_VERIFICATION_PASSED/);
  assert.ok(live.indexOf('DEPLOYMENT_SUCCEEDED') < live.indexOf('[DONE]'));
  assert.doesNotMatch(live, /\/tmp\/playwright|NODE_PATH|npm install -g/);

  assert.match(ci, /test:release-contract/);
  assert.match(liveConfig, /work-post-deploy-live\.spec\.ts/);
  assert.match(normalConfig, /testIgnore:\s*'work-post-deploy-live\.spec\.ts'/);
  assert.match(deployment, /\[READY FOR MANUAL WORK\].*\[IN DEVELOPMENT\].*\[IN REVIEW\].*\[READY FOR RELEASE\].*\[DEPLOYING\].*\[LIVE VERIFY\].*\[DONE\]/s);
});
