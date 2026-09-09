
import { notFound } from 'next/navigation';
import { getFeedbackById } from '../actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { FeedbackDetailClient } from './client-page';

import { getAdminDb } from '@/lib/firebase-admin';
import type { Customer, OrderDetail } from '@/types';
import { getOrderDetails } from '@/app/superadmin/sales/orders/[orderId]/page';

async function getCustomerName(customerId: string, brandId: string): Promise<string> {
    const snap = await getAdminDb().collection('customers').doc(customerId).get();
    return snap.exists && snap.data()?.brandId === brandId ? snap.data()?.fullName || 'Unknown Customer' : 'Unknown Customer';
}

export default async function FeedbackDetailPage({ params }: { params: Promise<{ feedbackId: string }> }) {
    const { feedbackId } = await params;
    
    if (!feedbackId) {
        notFound();
    }
    
    const feedback = await getFeedbackById(feedbackId);

    if (!feedback) {
        notFound();
    }

    const [brand, location, customerName] = await Promise.all([
        getBrandById(feedback.brandId),
        getLocationById(feedback.locationId),
        getCustomerName(feedback.customerId, feedback.brandId),
    ]);

    const fullFeedback = {
        ...feedback,
        brandName: brand?.name || 'N/A',
        locationName: location?.name || 'N/A',
        customerName,
    };

    return (
        <FeedbackDetailClient initialFeedback={fullFeedback} />
    );
}
