'use strict';
const { assertRuntime, startProvider, createFixture } = require('./native-intent-fixture.cjs');
let stage = 'runtime';
async function main() {
  assertRuntime();
  let source, provider, fixture, result, cleanupVerified = false;
  try {
    stage = 'source'; source = require('./native-intent-source.cjs').loadNativeIntentSource();
    stage = 'provider';
    provider = await startProvider();
    stage = 'fixture'; fixture = await createFixture(source.getAdminDb());
    stage = 'proof';
    result = await require('./intent-proof.cjs').runIntentProof({ projectId: 'demo-orderfly-qa0', sourceCommit: source.sourceCommit,
      db: source.getAdminDb(), scope: fixture.scope, registry: fixture.registry,
      settle: async () => { try { return await source.settlePaidCheckoutSession(fixture.session); }
        catch (error) { if (['invalid_reference','invalid_catalog','invalid_order','invalid_intent','ineligible_intent','queue_unverified','job_conflict','write_budget_exceeded','payment_unverified','proof_unavailable','transition_unverified'].includes(error?.code)) stage = error.code; throw error; } } });
    stage = 'provider-count'; const count = provider.counts();
    if (count.requests !== 2 || count.rejected !== 0) throw Error('QA511 provider proof failed');
  } finally {
    try { if (fixture) { await fixture.cleanup(); cleanupVerified = true; } }
    finally { try { if (provider) await provider.close(); } finally { if (source) await source.close(); } }
  }
  console.log(JSON.stringify({ ...result, nativeExecution: true, stripeSdkLoopbackRequests: 2, cleanupVerified,
    softwareOnly: true, productionAcceptance: false, physicalPrintVerified: false }));
}
if (require.main === module) main().catch(() => { console.error('QA511 native intent proof failed at ' + stage); process.exitCode = 1; });
module.exports = { main };
