'use strict';
const { environment } = require('./environment.cjs');

// No inherited provider keys, ADC, proxy, output or runtime mode. This does not
// start a process or change the caller environment or ordinary QA0 builder.
function intentEnvironment() {
  return { ...environment(), ORDERFLY_LOCAL_QA_INTENT_PROOF: 'true',
    ORDERFLY_PRINT_INTENTS_ENABLED: 'true', ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false' };
}
module.exports = { intentEnvironment };
