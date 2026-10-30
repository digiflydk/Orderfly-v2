import { z } from 'zod';

export const quoteTimingStages = ['scope', 'configuration', 'pricing', 'draft', 'runtime', 'routing', 'provider', 'claim', 'wolt_authority', 'wolt_secret', 'wolt_http', 'wolt_store', 'routing_geocode', 'routing_http', 'routing_budget'] as const;
export type QuoteTimingStage = typeof quoteTimingStages[number];
const milliseconds = z.number().int().nonnegative().max(3_600_000);
export const quoteTimingsSchema = z.object({
  serverMs: milliseconds,
  stages: z.record(z.enum(quoteTimingStages), z.object({ ms: milliseconds, count: z.number().int().min(1).max(1000) }).strict()),
}).strict();
export type QuoteTimings = z.infer<typeof quoteTimingsSchema>;
