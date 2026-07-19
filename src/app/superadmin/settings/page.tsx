
import { SettingsForm } from "@/components/superadmin/settings/settings-form";
import { getPlatformSettings } from "./actions";
import type { PlatformBrandingSettings } from "@/types";

export default async function SettingsPage() {
    const { analyticsSettings, paymentGatewaySettings, languageSettings, brandingSettings } = await getPlatformSettings();
    const safeBrandingSettings: PlatformBrandingSettings = brandingSettings ?? {
        platformLogoUrl: null,
        platformFaviconUrl: null,
        platformHeading: 'OrderFly',
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
                <p className="text-muted-foreground">
                    Configure global settings for analytics, payments, and languages.
                </p>
            </div>

            <SettingsForm
                initialAnalyticsSettings={analyticsSettings}
                initialPaymentGatewaySettings={paymentGatewaySettings}
                initialLanguageSettings={languageSettings}
                initialBrandingSettings={safeBrandingSettings}
            />
        </div>
    );
}
