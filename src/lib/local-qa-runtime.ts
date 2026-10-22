import { localQaEnvironment } from './local-qa-environment';
import { localQaIntentEnvironment } from './local-qa-intent-environment';

/** A declared malformed variant can never fall back to ordinary/production. */
export function localQaRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return Object.hasOwn(env, 'ORDERFLY_LOCAL_QA_INTENT_PROOF')
    ? localQaIntentEnvironment(env) : localQaEnvironment(env);
}
