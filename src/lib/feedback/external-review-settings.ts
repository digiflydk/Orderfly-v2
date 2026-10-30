import { z } from 'zod';

function reviewUrlAllowed(value: string, provider: 'google' | 'trustpilot'): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
    const host = url.hostname;
    if (provider === 'trustpilot') {
      return ['trustpilot.com', 'www.trustpilot.com', 'dk.trustpilot.com'].includes(host)
        && /^\/(?:review|evaluate)\/[^/]+\/?$/.test(url.pathname);
    }
    if (host === 'g.page') return /^\/r\/[^/]+\/review\/?$/.test(url.pathname);
    if (host === 'maps.app.goo.gl') return /^\/[^/]+\/?$/.test(url.pathname);
    if (host === 'goo.gl') return /^\/maps\/[^/]+\/?$/.test(url.pathname);
    if (host === 'search.google.com') return url.pathname === '/local/writereview' && Boolean(url.searchParams.get('placeid'));
    return ['google.com', 'www.google.com', 'google.dk', 'www.google.dk', 'maps.google.com'].includes(host)
      && /^\/maps(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

const reviewUrl = (provider: 'google' | 'trustpilot') => z.string().trim().max(2048)
  .refine(value => reviewUrlAllowed(value, provider), `Angiv et gyldigt HTTPS-anmeldelseslink til ${provider === 'google' ? 'Google' : 'Trustpilot'}.`)
  .default('');

export const externalReviewSettingsSchema = z.object({
  externalReviewsEnabled: z.boolean().default(false),
  externalReviewsMinRating: z.number().finite().min(0).max(5).default(4.7),
  googleReviewUrl: reviewUrl('google'),
  trustpilotReviewUrl: reviewUrl('trustpilot'),
});
export type ExternalReviewSettings = z.infer<typeof externalReviewSettingsSchema>;

/** Invalid stored configuration never produces a customer invitation. */
export function externalReviewSettings(raw: unknown): ExternalReviewSettings {
  const parsed = externalReviewSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : externalReviewSettingsSchema.parse({});
}

export function eligibleExternalReviewLinks(raw: unknown, rating: unknown): Pick<ExternalReviewSettings, 'googleReviewUrl' | 'trustpilotReviewUrl'> | null {
  const settings = externalReviewSettings(raw);
  if (!settings.externalReviewsEnabled || typeof rating !== 'number' || !Number.isFinite(rating)
    || rating < 0 || rating > 5 || rating <= settings.externalReviewsMinRating
    || (!settings.googleReviewUrl && !settings.trustpilotReviewUrl)) return null;
  return { googleReviewUrl: settings.googleReviewUrl, trustpilotReviewUrl: settings.trustpilotReviewUrl };
}
