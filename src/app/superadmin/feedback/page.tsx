

import { getFeedbackEntries } from "./actions";
import { getBrands } from '@/app/superadmin/brands/actions';
import { getAllLocations } from '@/app/superadmin/locations/actions';
import { getCustomers } from '@/app/superadmin/customers/actions';
import { getFeedbackQuestionVersions } from './actions';
import { FeedbackClientPage } from './client-page';
import type { Brand, Location, User, Feedback, FeedbackQuestionsVersion, Customer } from '@/types';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

async function FeedbackPageContent() {
    const [feedback, brands, locations, customers, versions] = await Promise.all([
        getFeedbackEntries(),
        getBrands(),
        getAllLocations(),
        getCustomers(),
        getFeedbackQuestionVersions(),
    ]);

    const brandMap = new Map(brands.map(b => [b.id, b.name]));
    const locationMap = new Map(locations.map(l => [l.id, l.name]));
    const customerMap = new Map(customers.map(c => [c.id, c.fullName]));
    const versionMap = new Map(versions.map(v => [v.id, v.versionLabel]));

    const feedbackWithDetails = feedback.map(f => ({
        ...f,
        brandName: brandMap.get(f.brandId) || 'N/A',
        locationName: locationMap.get(f.locationId) || 'N/A',
        customerName: customerMap.get(f.customerId) || 'Unknown Customer',
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
            <FeedbackClientPage 
                initialFeedback={feedbackWithDetails}
                brands={brands}
                locations={locations}
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
