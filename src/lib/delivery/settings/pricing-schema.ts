import { z } from 'zod';
import { validateDeliveryPricingRules } from '../pricing/calculate';

const amount = z.number().int().nonnegative().safe();
const distance = z.number().int().nonnegative().max(100000);
const tariffFields = { baseMinor: amount, includedMeters: distance, perKmMinor: amount };
export const deliveryPricingRulesSchema = z.object({
  version: z.string().trim().min(1).max(200), currency: z.string().regex(/^[A-Z]{3}$/), taxBasis: z.enum(['inclusive', 'exclusive']),
  maxDistanceMeters: distance, minimumMinor: amount, maximumCustomerFeeMinor: amount, maximumSubsidyMinor: amount,
  tariff: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('bands'), bands: z.array(z.object({ fromMeters: distance, toMeters: distance, feeMinor: amount, minimumMinor: amount }).strict()).min(1).max(100) }).strict(),
    z.object({ kind: z.literal('kilometer'), ...tariffFields }).strict(),
  ]),
  freeDelivery: z.object({ minimumMinor: amount, maxDistanceMeters: distance }).strict().optional(),
  localCostTariff: z.object(tariffFields).strict().optional(),
}).strict().refine(validateDeliveryPricingRules, 'Kontrollér prisintervaller og afstandsgrænser.');
