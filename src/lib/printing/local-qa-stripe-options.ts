import 'server-only';
import { localQaIntentEnvironment } from '@/lib/local-qa-intent-environment';

/** Fixed synthetic provider, available only in the complete isolated intent runtime. */
export function localQaStripeOptions() {
  if (!Object.hasOwn(process.env, 'ORDERFLY_LOCAL_QA_INTENT_PROOF')) return null;
  localQaIntentEnvironment();
  if (Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true)
    throw new Error('Local QA provider boundary rejected');
  return Object.freeze({ key: 'sk_test_orderfly_qa0_synthetic_only', options: Object.freeze({
    host: '127.0.0.1', port: 3100, protocol: 'http' as const, timeout: 5000, maxNetworkRetries: 0,
  }) });
}
