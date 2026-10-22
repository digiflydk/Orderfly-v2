'use strict';
// One fixed backend proof entry; no argv/module/env injection or production fallback.
if (process.argv.length !== 2 || process.env.QA0_BROWSER_PROOF !== undefined || process.env.QA0_CREDENTIAL_METADATA_PROOF !== undefined) { console.error('Native intent arguments rejected'); process.exitCode=1; }
else require('./run-backend.cjs').runNativeIntentProof().then(result => console.log(JSON.stringify(result))).catch(error => {
  console.error(/^Native intent proof failed at (runtime|source|provider|fixture|proof|provider-count|invalid_reference|invalid_catalog|invalid_order|invalid_intent|ineligible_intent|queue_unverified|job_conflict|write_budget_exceeded|payment_unverified|proof_unavailable|transition_unverified|unknown)$/.test(error.message) ? error.message : 'Native intent proof failed'); process.exitCode=1;
});
