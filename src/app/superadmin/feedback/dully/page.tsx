import { requireFeedbackAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { DullyFeedbackView } from './dully-view';
import { ESMERALDA_FEEDBACK_BRAND } from '@/lib/feedback/esmeralda-booking-setup';

export default async function DullyFeedbackPage() {
  const access = await requireFeedbackAccess();
  const options = await feedbackScopeOptions(access);
  const brands = options.brands.filter(brand => brand.id === ESMERALDA_FEEDBACK_BRAND);
  if (!brands.length) return <div className="space-y-3"><h1 className="text-2xl font-bold">Dully-feedback</h1><p>Dully-feedback er endnu kun opsat for Esmeralda. Du har ikke adgang til en understøttet datakilde.</p></div>;
  return <DullyFeedbackView
    brands={brands}
    locations={options.locations.filter(location => location.isActive && brands.some(brand => brand.id === location.brandId)).sort((a, b) => a.name.localeCompare(b.name, 'da'))}
  />;
}
