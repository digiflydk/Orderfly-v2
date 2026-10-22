import { localQaEnvironment } from './local-qa-environment';

/** Separate opt-in for software intent evidence. Ordinary QA0 still rejects ON. */
export function localQaIntentEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.ORDERFLY_LOCAL_QA_INTENT_PROOF !== 'true'
    || env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true'
    || env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'false'
    || env.NODE_ENV !== 'development') throw new Error('Local QA intent variant rejected');
  if (Object.hasOwn(env, 'ORDERFLY_LOCAL_QA_BROWSER') || Object.hasOwn(env, 'QA0_BROWSER_PROOF')) throw new Error('Local QA intent browser mode rejected');
  // Proxy settings are not required for loopback and must never survive into
  // an explicitly isolated variant, including an empty/no-proxy declaration.
  if (Object.keys(env).some(key => /(?:^|_)proxy$/i.test(key))) throw new Error('Local QA intent proxy configuration rejected');
  // Validate the original complete guard on a COPY. These are the only two
  // exact, already-validated declarations exempted from ordinary QA0's ban.
  const ordinary = { ...env };
  delete ordinary.ORDERFLY_LOCAL_QA_INTENT_PROOF;
  delete ordinary.ORDERFLY_PRINT_INTENTS_ENABLED;
  const local = localQaEnvironment(ordinary);
  if (!local) throw new Error('Local QA intent environment is incomplete');
  return local;
}
