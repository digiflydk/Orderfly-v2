
import { redirect } from 'next/navigation';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { getLoyaltySettingsState } from '../actions';
import { LoyaltySettingsClientPage } from './client-page';

export default async function LoyaltySettingsPage() {
    const session = await orderflySession().catch(() => null);
    if (!session) redirect('/admin-login');
    if (!session.superuser && !session.permissions.includes('orderfly.customer_score:view')) return <AccessDeniedPage />;
    const {settings,warning} = await getLoyaltySettingsState();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Kundescore</h1>
                <p className="text-muted-foreground">
                    Define and manage the global scoring model for customer loyalty.
                </p>
            </div>
            {warning && <p role="alert" className="rounded border p-4">{warning}</p>}
            <LoyaltySettingsClientPage initialSettings={settings} />
        </div>
    );
}
