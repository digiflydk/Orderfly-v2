import 'server-only';
import { z } from 'zod';
import { printerConfigurationSchema } from './configuration';

// Credential-free public configuration and private timestamp metadata only.
export const storedPrinterSchema = z.object({
  schemaVersion: z.literal(1), configuration: printerConfigurationSchema,
  revision: z.number().int().positive().safe(), deletedAt: z.null(),
  createdAt: z.unknown().optional(), updatedAt: z.unknown().optional(),
}).strict();
