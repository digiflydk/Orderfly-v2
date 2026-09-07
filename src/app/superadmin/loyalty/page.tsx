import { ProgramAdmin } from '@/components/loyalty/program-admin';
import { getBrands } from '@/app/superadmin/brands/actions';

import { getLoyaltySettingsState } from './actions';
import { LoyaltySettingsClientPage } from './client-page';

export default async function LoyaltySettingsPage() {
    const [{settings,warning},brands] = await Promise.all([getLoyaltySettingsState(),getBrands()]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Loyalty Score Settings</h1>
                <p className="text-muted-foreground">
                    Define and manage the global scoring model for customer loyalty.
                </p>
            </div>
            <ProgramAdmin brands={brands.map(b=>({id:b.id,name:b.name}))}/>
            {warning && <p role="alert" className="rounded border p-4">{warning}</p>}
            <LoyaltySettingsClientPage initialSettings={settings} />
        </div>
    );
}
