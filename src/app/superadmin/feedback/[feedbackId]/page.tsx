
import { notFound } from 'next/navigation';
import { getFeedbackById } from '../actions';
import { getBrandById } from '@/app/superadmin/brands/actions';
import { getLocationById } from '@/app/superadmin/locations/actions';
import { FeedbackDetailClient } from './client-page';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Customer, OrderDetail } from '@/types';
import { getOrderDetails } from '@/app/superadmin/sales/orders/[orderId]/page';

async function getCustomerName(customerId: string): Promise<string> {
    const customerRef = doc(db, 'customers', customerId);
    const customerSnap = await getDoc(customerRef);
    if(customerSnap.exists()){
        return (customerSnap.data() as Customer).fullName || 'Unknown Customer';
    }
    return 'Unknown Customer';
}

export default async function FeedbackDetailPage({ params }: { params: { feedbackId: string } }) {
    if (!params.feedbackId) {
        notFound();
    }
    
    const feedback = await getFeedbackById(params.feedbackId);

    if (!feedback) {
        notFound();
    }

    const [brand, location, customerName] = await Promise.all([
        getBrandById(feedback.brandId),
        getLocationById(feedback.locationId),
        getCustomerName(feedback.customerId),
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
