import { upsellClientData } from '@/lib/upsell-serialization';

import { getFeedbackEntries } from "./actions";
import { requireFeedbackAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { getAdminDb } from '@/lib/firebase-admin';
import { readQuestionVersions } from '@/lib/feedback/question-store';
import Link from '@/components/superadmin/admin-link';
import { FeedbackClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function FeedbackPageContent() {
    const access = await requireFeedbackAccess();
    const [feedback, { brands, locations }, versions] = await Promise.all([
        getFeedbackEntries(), feedbackScopeOptions(access), readQuestionVersions(),
    ]);
    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l]));
    const customerIds = [...new Set(feedback.map(f => f.customerId).filter(id => typeof id === 'string' && /^[\w-]{1,160}$/.test(id)))];
    const customers = await Promise.all(customerIds.map(id => getAdminDb().collection('customers').doc(id).get()));
    const customerMap = new Map(customers.map(c => [c.id, c.data()]));
    const versionMap = new Map(versions.map(v => [v.id, v.versionLabel]));

    const feedbackWithDetails = feedback.map(f => ({
        ...f,
        brandName: brandMap.get(f.brandId) || 'N/A',
        locationName: locationMap.get(f.locationId)?.brandId === f.brandId ? locationMap.get(f.locationId)!.name : 'N/A',
        customerName: customerMap.get(f.customerId)?.brandId === f.brandId ? String(customerMap.get(f.customerId)?.fullName || 'Unknown Customer') : 'Unknown Customer',
        showPublicly: f.showPublicly === true && Boolean(f.publication?.approvedBy),
        questionVersionLabel: versionMap.get(f.questionVersionId) || 'N/A',
    }));

    return (
        <div className="space-y-4">
             <div>
                <h1 className="text-2xl font-bold tracking-tight">Feedback Inbox</h1>
                <p className="text-muted-foreground">
                    View, manage, and moderate all customer feedback.
                </p>
            </div>
            <Link href="/superadmin/feedback/report" className="inline-block underline">Åbn kvalitetsrapport</Link>
            <FeedbackClientPage 
                canEdit={access.permissions.includes('feedback:edit')}
                initialFeedback={upsellClientData(feedbackWithDetails)}
                brands={upsellClientData(brands)}
                locations={upsellClientData(locations)}
            />
        </div>
    );
}

export default function FeedbackPage() {
    if (!isAdminReady()) {
        return (
            <EmptyState
                title="Admin Environment Not Configured"
                hint="This page requires Firebase Admin credentials, which are not available in this environment."
                details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
            />
        );
    }
    return <FeedbackPageContent />;
}
