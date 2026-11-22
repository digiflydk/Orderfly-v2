// The worker heartbeat (src/app/api/internal/feedback/send/route.ts) also runs payment
// recovery. Tests of its other workers mock these idle; payment-heartbeat.cjs covers them.
module.exports = {
  '@/lib/payments/native-free-recovery': { processDueNativeFreeCheckouts: async () => ({ state: 'idle' }) },
  '@/lib/payments/worldline-stale-holds': { processWorldlineStaleCheckouts: async () => ({ state: 'idle' }) },
  '@/lib/payments/worldline-reconcile': { processWorldlineJobs: async () => ({ state: 'idle' }) },
};
