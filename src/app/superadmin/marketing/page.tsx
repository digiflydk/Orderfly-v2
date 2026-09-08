import { marketingAdminAuthorized } from '@/lib/marketing/auth';
import { MarketingStatus } from './status-client';
export const dynamic = 'force-dynamic';
export default async function MarketingPage() {
    if (!await marketingAdminAuthorized())
        return <div className="p-6"><h1 className="text-2xl font-bold">Nyhedsbrev og Omnisend</h1><p className="mt-4">Visning af samtykker og genforsøg kræver et verificeret administratorlogin.</p></div>;
    return <MarketingStatus />;
}
