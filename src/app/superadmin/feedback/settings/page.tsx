import { requireFeedbackAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { readFeedbackSettings } from '@/lib/feedback/settings';
import { FeedbackSettingsView } from './settings-view';
import { feedbackMailJobs } from '@/lib/feedback/mail-admin';
import { readQuestionVersions } from '@/lib/feedback/question-store';
export default async function FeedbackSettingsPage() {
  const access = await requireFeedbackAccess();
  const options = await feedbackScopeOptions(access);
  const settings = await Promise.all(options.brands.map(async brand => ({ ...brand, ...await readFeedbackSettings(brand.id) })));
  const jobs = (await Promise.all(options.brands.map(brand => feedbackMailJobs(brand.id)))).flat();
  const questionVersions = (await readQuestionVersions()).filter(version => version.isActive).map(version => ({ id: version.id, name: version.versionLabel, language: version.language, orderTypes: version.orderTypes, scope: version.scope, brandId: version.brandId }));
  return <FeedbackSettingsView brands={settings} locations={options.locations} questionVersions={questionVersions} jobs={jobs} canEdit={access.permissions.includes('feedback:edit')} />;
}
