
import { getLoyaltySettings } from './actions';
import { LoyaltySettingsClientPage } from './client-page';

export default async function LoyaltySettingsPage() {
    const settings = await getLoyaltySettings();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Loyalty Score Settings</h1>
                <p className="text-muted-foreground">
                    Define and manage the global scoring model for customer loyalty.
                </p>
            </div>
            <LoyaltySettingsClientPage initialSettings={settings} />
        </div>
    );
}
