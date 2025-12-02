

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { AnalyticsSettings, PaymentGatewaySettings, LanguageSettings, Brand, PlatformBrandingSettings } from '@/types';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getPlatformBrandingSettings } from './queries';


const toNull = (v: unknown) => {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
};
const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

const UrlOrNull = z.preprocess(
  toNull,
  z.union([z.string().url().refine(u => u.startsWith('https://'), 'Must be https'), z.null()])
);

const brandingSchema = z.object({
  platformLogoUrl: UrlOrNull,
  platformFaviconUrl: UrlOrNull,
  platformHeading: z.preprocess(trim, z.string().min(1, 'Browser heading is required')),
});

const analyticsSettingsSchema = z.object({
  ga4TrackingId: z.string().regex(/^G-[A-Z0-9]{10}$/, { message: 'Invalid GA4 Tracking ID format (must be G-XXXXXXXXXX)'}).or(z.literal('')),
  gtmContainerId: z.string().regex(/^GTM-[A-Z0-9]{7}$/, { message: 'Invalid GTM ID format (must be GTM-XXXXXXX)' }).optional().or(z.literal('')),
});

const paymentGatewaySettingsSchema = z.object({
  activeMode: z.enum(['test', 'live']),
  test: z.object({
    publishableKey: z.string(),
    secretKey: z.string(),
    webhookSecret: z.string().optional(),
  }),
  live: z.object({
    publishableKey: z.string(),
    secretKey: z.string(),
    webhookSecret: z.string().optional(),
  }),
}).superRefine((data, ctx) => {
    const activeMode = data.activeMode;
    const fields = data[activeMode];

    if (!fields.publishableKey) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [`${activeMode}.publishableKey`],
            message: 'Publishable Key is required.',
        });
    }
     if (!fields.secretKey) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [`${activeMode}.secretKey`],
            message: 'Secret Key is required.',
        });
    }
});

const languageSettingsSchema = z.object({
  supportedLanguages: z.array(z.object({
    code: z.string().min(2, "Code is required").max(5),
    name: z.string().min(2, "Name is required"),
  })),
});


export type FormState = {
  message: string;
  error: boolean;
  errors?: z.ZodIssue[];
};

// Default settings if nothing is found in Firestore
const defaultPaymentGatewaySettings: PaymentGatewaySettings = {
  activeMode: 'test',
  test: { publishableKey: '', secretKey: '', webhookSecret: '' },
  live: { publishableKey: '', secretKey: '', webhookSecret: '' },
};

const defaultLanguageSettings: LanguageSettings = {
  supportedLanguages: [{ code: 'en', name: 'English' }, { code: 'da', name: 'Dansk' }],
};

const defaultAnalyticsSettings: AnalyticsSettings = { ga4TrackingId: '', gtmContainerId: '' };

async function saveBranding(data: PlatformBrandingSettings) {
    const settingsRef = doc(db, 'platform_settings', 'branding');
    await setDoc(settingsRef, data, { merge: true });
}

// Function to update analytics settings
export async function updateAnalyticsSettings(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData = {
    ga4TrackingId: formData.get('ga4TrackingId'),
    gtmContainerId: formData.get('gtmContainerId'),
  };

  const validatedFields = analyticsSettingsSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: 'Validation failed: ' + errorMessages,
      error: true,
    };
  }
  
  try {
    const settingsRef = doc(db, 'platform_settings', 'analytics');
    await setDoc(settingsRef, validatedFields.data);
    revalidatePath('/superadmin/settings');
    return { message: 'Analytics settings updated successfully.', error: false };
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update settings: ${errorMessage}`, error: true };
  }
}

// Function to update payment gateway settings
export async function updatePaymentGatewaySettings(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const activeMode = formData.get('activeMode') as 'test' | 'live';
  
  const rawData = {
    activeMode: activeMode,
    test: {
      publishableKey: formData.get('test.publishableKey') || '',
      secretKey: formData.get('test.secretKey') || '',
      webhookSecret: formData.get('test.webhookSecret') || '',
    },
    live: {
      publishableKey: formData.get('live.publishableKey') || '',
      secretKey: formData.get('live.secretKey') || '',
      webhookSecret: formData.get('live.webhookSecret') || '',
    }
  };

  const validatedFields = paymentGatewaySettingsSchema.safeParse(rawData);
  
  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: `Validation failed: ${errorMessages}`,
      error: true,
    };
  }

  try {
    const settingsRef = doc(db, 'platform_settings', 'payment_gateway');
    await setDoc(settingsRef, validatedFields.data);
    revalidatePath('/superadmin/settings');
    return { message: 'Payment gateway settings updated successfully.', error: false };
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update settings: ${errorMessage}`, error: true };
  }
}

// Function to update language settings
export async function updateLanguageSettings(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  try {
    const supportedLanguages = JSON.parse(formData.get('supportedLanguages') as string || '[]');
    const validatedFields = languageSettingsSchema.safeParse({ supportedLanguages });

    if (!validatedFields.success) {
        console.error('Language validation failed:', validatedFields.error.flatten());
        return { message: 'Invalid language data.', error: true };
    }
    
    await setDoc(doc(db, 'platform_settings', 'languages'), validatedFields.data);
    revalidatePath('/superadmin/settings');
    return { message: 'Language settings updated successfully.', error: false };
    
  } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      return { message: `Failed to update language settings: ${errorMessage}`, error: true };
  }
}

// Function to update branding settings
export async function updateBrandingSettings(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData = {
    platformLogoUrl: formData.get('platformLogoUrl'),
    platformFaviconUrl: formData.get('platformFaviconUrl'),
    platformHeading: formData.get('platformHeading'),
  };

  const parsed = brandingSchema.safeParse(rawData);
  if (!parsed.success) {
    const e = parsed.error.errors[0];
    return {
      error: true,
      message: `Validation failed: ${e?.path?.join('.') ?? 'field'} – ${e?.message ?? 'Invalid input'}`,
    };
  }
  
  try {
    await saveBranding(parsed.data);
    
    revalidatePath('/superadmin/settings');
    revalidatePath('/'); // Revalidate root layout for favicon/title changes
    return { message: 'Branding settings updated.', error: false };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update branding settings: ${errorMessage}`, error: true };
  }
}


// Function to get all settings
export async function getPlatformSettings(): Promise<{
  analyticsSettings: AnalyticsSettings;
  paymentGatewaySettings: PaymentGatewaySettings;
  languageSettings: LanguageSettings;
  brandingSettings: PlatformBrandingSettings | null;
}> {
  const analyticsDoc = await getDoc(doc(db, 'platform_settings', 'analytics'));
  const paymentDoc = await getDoc(doc(db, 'platform_settings', 'payment_gateway'));
  const languagesDoc = await getDoc(doc(db, 'platform_settings', 'languages'));
  const brandingSettings = await getPlatformBrandingSettings();

  const analyticsSettings: AnalyticsSettings = analyticsDoc.exists()
    ? (analyticsDoc.data() as AnalyticsSettings)
    : defaultAnalyticsSettings;

  const paymentGatewaySettings: PaymentGatewaySettings = paymentDoc.exists()
    ? (paymentDoc.data() as PaymentGatewaySettings)
    : defaultPaymentGatewaySettings;

  const languageSettings: LanguageSettings = languagesDoc.exists()
    ? (languagesDoc.data() as LanguageSettings)
    : defaultLanguageSettings;

  return {
    analyticsSettings,
    paymentGatewaySettings,
    languageSettings,
    brandingSettings,
  };
}


// Helpers to get active Stripe keys
export async function getActiveStripeKey(): Promise<string | null> {
    const settings = await getPlatformSettings();
    const mode = settings.paymentGatewaySettings.activeMode;
    return settings.paymentGatewaySettings[mode]?.publishableKey || null;
}

export async function getActiveStripeSecretKey(): Promise<string | null> {
    const settings = await getPlatformSettings();
    const mode = settings.paymentGatewaySettings.activeMode;
    return settings.paymentGatewaySettings[mode]?.secretKey || null;
}

export async function getActiveStripeWebhookSecret(): Promise<string | null> {
    const settings = await getPlatformSettings();
    const mode = settings.paymentGatewaySettings.activeMode;
    return settings.paymentGatewaySettings[mode]?.webhookSecret || null;
}
