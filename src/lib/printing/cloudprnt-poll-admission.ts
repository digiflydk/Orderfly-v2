import 'server-only';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

/** Process-local cost/concurrency bound, independent of caller-controlled scope/IP. */
export function createCloudPrntPollAdmission(now: () => number = () => performance.now()) {
  const keys = new Map<string, { tokens: number; time: number }>();
  let globalTokens = 20, globalTime = now(), active = 0;
  return function admit(authorization: string | null): (() => void) | null {
    const time = now();
    if (!Number.isFinite(time) || time < globalTime) return null;
    globalTokens = Math.min(20, globalTokens + (time - globalTime) * 120 / 60_000);
    globalTime = time;
    if (active >= 8 || globalTokens < 1) return null;
    // Never retain headers/plaintext credentials, and bound hashing before allocation.
    const key = authorization && authorization.length <= 256
      ? createHash('sha256').update(authorization).digest('hex') : 'anonymous';
    let bucket = keys.get(key);
    if (!bucket) {
      for (const [storedKey, value] of keys) {
        if (time - value.time >= 60_000) keys.delete(storedKey);
      }
      if (keys.size >= 128) return null;
      bucket = { tokens: 10, time };
      keys.set(key, bucket);
    }
    bucket.tokens = Math.min(10, bucket.tokens + (time - bucket.time) * 30 / 60_000);
    bucket.time = time;
    if (bucket.tokens < 1) return null;
    globalTokens--;
    bucket.tokens--;
    active++;
    let released = false;
    return () => { if (!released) { released = true; active--; } };
  };
}

export const admitCloudPrntPoll = createCloudPrntPollAdmission();
