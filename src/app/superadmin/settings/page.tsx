

import { SettingsForm } from "@/components/superadmin/settings/settings-form";
import { getPlatformSettings } from "./actions";

export default async function SettingsPage() {
    const { paymentGatewaySettings, languageSettings, brandingSettings } = await getPlatformSettings();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Platform Settings</h1>
                <p className="text-muted-foreground">
                    Configure global settings for branding, payments, languages, and cookie texts.
                </p>
            </div>

            <SettingsForm
                initialPaymentGatewaySettings={paymentGatewaySettings}
                initialLanguageSettings={languageSettings}
                initialBrandingSettings={brandingSettings}
            />
        </div>
    );
}
