'use strict';
// Only selects the proof; the existing launcher still constructs the clean env,
// starts fixed demo emulators/Next, runs two passes and owns process teardown.
process.env.QA0_BROWSER_PROOF = 'true';
require('./run-backend.cjs');
