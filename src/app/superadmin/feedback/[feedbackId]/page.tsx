
import { notFound } from 'next/navigation';
import { getFeedbackById } from '../actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { FeedbackDetailClient } from './client-page';

import { getAdminDb } from '@/lib/firebase-admin';
import type { Customer, OrderDetail } from '@/types';
import { requireFeedbackAccess, canEditFeedbackBrand } from '@/lib/feedback/access';
import { getDullyOrderDetails } from '@/lib/feedback/dully-details';

async function getCustomerName(customerId: string, brandId: string): Promise<string> {
    const snap = await getAdminDb().collection('customers').doc(customerId).get();
    return snap.exists && snap.data()?.brandId === brandId ? snap.data()?.fullName || 'Unknown Customer' : 'Unknown Customer';
}

export default async function FeedbackDetailPage({ params }: { params: Promise<{ feedbackId: string }> }) {
    const { feedbackId } = await params;
    const access = await requireFeedbackAccess();
    
    if (!feedbackId) {
        notFound();
    }
    
    const feedback = await getFeedbackById(feedbackId);

    if (!feedback) {
        notFound();
    }

    const dullySourceId = feedback.sourceType === 'dully_order' ? String((feedback as any).sourceId || feedback.customerId || '') : '';
    const [brand, location, customerName, dullyDetails] = await Promise.all([
        getBrandById(feedback.brandId),
        getLocationById(feedback.locationId),
        feedback.sourceType === 'dully_order' ? Promise.resolve('Dully-kunde') : feedback.sourceType === 'dine_in' ? Promise.resolve('Anonym gæst') : getCustomerName(feedback.customerId, feedback.brandId),
        dullySourceId ? getDullyOrderDetails([dullySourceId], feedback.brandId) : Promise.resolve(new Map()),
    ]);
    const dullyOrder = dullyDetails.get(dullySourceId) ?? null;

    const fullFeedback = {
        ...feedback,
        brandName: brand?.name || 'N/A',
        locationName: location?.brandId === feedback.brandId ? location.name : 'N/A',
        showPublicly: feedback.showPublicly === true && Boolean(feedback.publication?.approvedBy),
        maskCustomerName: feedback.publication ? feedback.maskCustomerName : true,
        customerName: dullyOrder?.customerName || customerName,
        dullyOrder,
    };

    return (
        <FeedbackDetailClient initialFeedback={fullFeedback} canEdit={canEditFeedbackBrand(access, feedback.brandId)} />
    );
}
