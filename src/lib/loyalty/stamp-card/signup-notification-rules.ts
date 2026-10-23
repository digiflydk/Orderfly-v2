import { z } from 'zod';

export const signupNotificationSettingsSchema = z.object({
  enabled: z.boolean(),
  recipientEmail: z.string().trim().email().max(254).transform(value => value.toLowerCase()).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.recipientEmail) ctx.addIssue({ code: 'custom', path: ['recipientEmail'], message: 'Angiv en gyldig e-mailadresse.' });
});
export type SignupNotificationSettings = z.infer<typeof signupNotificationSettingsSchema>;
export const saveSignupNotificationsSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  version: z.number().int().nonnegative(),
  settings: signupNotificationSettingsSchema,
}).strict();

export function signupNotificationSettings(data: unknown, brandId: string): { version: number; settings: SignupNotificationSettings } {
  const parsed = z.object({ brandId: z.string(), version: z.number().int().positive(), settings: signupNotificationSettingsSchema }).safeParse(data);
  return parsed.success && parsed.data.brandId === brandId ? { version: parsed.data.version, settings: parsed.data.settings } : { version: 0, settings: { enabled: false, recipientEmail: null } };
}
