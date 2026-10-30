import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { quoteTimingStages, type QuoteTimingStage, type QuoteTimings } from './performance-schema';

type TimingContext = { stages: QuoteTimings['stages']; closed: boolean };
const contexts = new AsyncLocalStorage<TimingContext>();
const allowed = new Set<string>(quoteTimingStages);
const elapsed = (start: number) => Math.min(3_600_000, Math.max(0, Math.round(performance.now() - start)));

/** Request-local timings only; no identifiers, inputs, results or errors are retained. */
export async function withQuoteTimings<T>(run: () => Promise<T>): Promise<{ result: T; timings: QuoteTimings }> {
  const context: TimingContext = { stages: {}, closed: false }, start = performance.now();
  return contexts.run(context, async () => {
    try {
      const result = await run();
      context.closed = true;
      return { result, timings: { serverMs: elapsed(start), stages: structuredClone(context.stages) } };
    } finally { context.closed = true; }
  });
}

/** Nested/parallel stage totals overlap; serverMs is the total, not their sum. */
export async function measureQuoteStep<T>(stage: QuoteTimingStage, run: () => Promise<T>): Promise<T> {
  const context = contexts.getStore();
  if (!context || context.closed || !allowed.has(stage)) return run();
  const start = performance.now();
  try { return await run(); }
  finally {
    if (!context.closed) {
      const previous = context.stages[stage];
      context.stages[stage] = { ms: Math.min(3_600_000, (previous?.ms ?? 0) + elapsed(start)), count: Math.min(1000, (previous?.count ?? 0) + 1) };
    }
  }
}
