import { requireFeedbackAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { readFeedbackSettings } from '@/lib/feedback/settings';
import { FeedbackSettingsView } from './settings-view';
import { feedbackMailJobs } from '@/lib/feedback/mail-admin';
export default async function FeedbackSettingsPage() {
  const access = await requireFeedbackAccess();
  const options = await feedbackScopeOptions(access);
  const settings = await Promise.all(options.brands.map(async brand => ({ ...brand, ...await readFeedbackSettings(brand.id) })));
  const jobs = (await Promise.all(options.brands.map(brand => feedbackMailJobs(brand.id)))).flat();
  return <FeedbackSettingsView brands={settings} locations={options.locations} jobs={jobs} canEdit={access.permissions.includes('feedback:edit')} />;
}
