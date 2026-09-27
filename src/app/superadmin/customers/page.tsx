
import { customerDirectory } from '@/lib/customers/directory-server';
import { CustomersDirectory } from './directory-client';
import { getAdminDb } from '@/lib/firebase-admin';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

async function CustomerPageContent() {
    const {entries, global} = await customerDirectory();
    const brandIds = [...new Set(entries.flatMap(entry => entry.brandIds))];
    const brands = await Promise.all(brandIds.map(id => getAdminDb().collection('brands').doc(id).get()));
    const brandNames = Object.fromEntries(brands.filter(doc => doc.exists).map(doc => [doc.id, String(doc.data()?.name || doc.id)]));
    return <CustomersDirectory entries={entries} brandNames={brandNames} global={global} />;
}


export default function CustomersPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    
    return <CustomerPageContent />;
}
