import 'server-only';
import { z } from 'zod';
import type { PrinterConfiguration, PrintScope } from './domain';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ brandId: identifier, locationId: identifier }).strict();
const modelSchema = z.enum(['mc-print2', 'mc-print3']);
const stateSchema = z.enum(['active', 'paused', 'disabled']);

/** Configuration is a credential-free DTO. Device evidence is never accepted here. */
export const printerConfigurationSchema = z.object({
  id: identifier,
  brandId: identifier,
  locationId: identifier,
  name: z.string().max(160).regex(/^[^\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]*$/u).trim().min(1).max(80),
  manufacturer: z.literal('star'),
  model: modelSchema,
  transport: z.enum(['cloudprnt-http', 'cloudprnt-mqtt']),
  state: stateSchema,
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
}).strict().superRefine((config, context) => {
  if (config.model === 'mc-print2' && config.transport === 'cloudprnt-mqtt') {
    context.addIssue({ code: 'custom', path: ['transport'], message: 'Unsupported transport' });
  }
  if (config.model === 'mc-print2' && config.paperWidthMm !== 58) {
    context.addIssue({ code: 'custom', path: ['paperWidthMm'], message: 'Unsupported paper width' });
  }
});

type ConfigurationResult = { ok: true; configuration: PrinterConfiguration }
  | { ok: false; code: 'invalid_configuration' | 'invalid_scope' | 'scope_mismatch' };

/** Caller must authenticate/authorize first and load the location from server storage. */
export function validatePrinterConfiguration(
  input: unknown, authorizedScope: PrintScope, locationReference: unknown,
): ConfigurationResult {
  const scope = scopeSchema.safeParse(authorizedScope);
  const location = z.object({ id: identifier, brandId: identifier }).strict().safeParse(locationReference);
  if (!scope.success || !location.success) return { ok: false, code: 'invalid_scope' };
  const parsed = printerConfigurationSchema.safeParse(input);
  // Do not return Zod errors: unknown keys could contain secret names/values.
  if (!parsed.success) return { ok: false, code: 'invalid_configuration' };
  if (parsed.data.brandId !== scope.data.brandId || parsed.data.locationId !== scope.data.locationId
    || location.data.id !== scope.data.locationId || location.data.brandId !== scope.data.brandId) {
    return { ok: false, code: 'scope_mismatch' };
  }
  return { ok: true, configuration: parsed.data };
}

const deviceEvidenceSchema = z.object({
  printerId: identifier, brandId: identifier, locationId: identifier,
  model: modelSchema,
  variant: z.string().regex(/^[A-Z0-9-]{1,32}$/).optional(),
  firmware: z.string().regex(/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/),
  verifiedAt: z.number().int().positive().safe(),
  source: z.enum(['self-test', 'device-query']),
}).strict();

export type PrinterCapability = { status: 'pending' | 'unsupported' | 'verified';
  reason: 'device_verification_required' | 'invalid_configuration' | 'invalid_evidence'
    | 'scope_mismatch' | 'variant_required' | 'unsupported_variant' | 'firmware_too_old'
    | 'verified_device'; };

/** Evidence comes from a trusted server verification workflow, never a setup request.
 * A verified transport is protocol compatibility, not successful physical print QA.
 */
export function printerTransportCapability(input: PrinterConfiguration, trustedEvidence?: unknown): PrinterCapability {
  const config = printerConfigurationSchema.safeParse(input);
  if (!config.success) return { status: 'unsupported', reason: 'invalid_configuration' };
  if (trustedEvidence === undefined) return { status: 'pending', reason: 'device_verification_required' };
  const evidence = deviceEvidenceSchema.safeParse(trustedEvidence);
  if (!evidence.success) return { status: 'pending', reason: 'invalid_evidence' };
  const device = evidence.data;
  if (device.printerId !== config.data.id || device.brandId !== config.data.brandId
    || device.locationId !== config.data.locationId || device.model !== config.data.model) {
    return { status: 'pending', reason: 'scope_mismatch' };
  }
  const mqtt = config.data.transport === 'cloudprnt-mqtt';
  if (mqtt && !device.variant) return { status: 'pending', reason: 'variant_required' };
  if (mqtt && !['MCP31CBI', 'MCP31CI'].includes(device.variant!)) {
    return { status: 'unsupported', reason: 'unsupported_variant' };
  }
  const [major, minor] = device.firmware.split('.').map(Number);
  const [minMajor, minMinor] = mqtt ? [5, 1] : [1, 2];
  if (major < minMajor || (major === minMajor && minor < minMinor)) {
    return { status: 'unsupported', reason: 'firmware_too_old' };
  }
  return { status: 'verified', reason: 'verified_device' };
}

/** Policy only. Future persistence must preserve jobs/audit history on soft-delete.
 * Resume always needs an explicit queue-age review before releasing waiting jobs.
 */
export function printerLifecyclePolicy(input: unknown) {
  const state = z.enum(['active', 'paused', 'disabled', 'deleted']).parse(input);
  return {
    acceptsNewJobs: state === 'active' || state === 'paused',
    dispatchesJobs: state === 'active',
    visibleInSetup: state !== 'deleted',
    retainHistory: true as const,
    reviewQueueBeforeResume: state !== 'active',
  };
}
