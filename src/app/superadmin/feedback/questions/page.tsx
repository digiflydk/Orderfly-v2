import { getFeedbackQuestionVersions } from "./actions";
import FeedbackQuestionsClientPage from "./client-page";
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';
import { requireQuestionAccess } from '@/lib/feedback/access';

export default async function FeedbackQuestionsPage() {
  const versions = await getFeedbackQuestionVersions();
  const { brands } = await feedbackScopeOptions(await requireQuestionAccess());
  return <FeedbackQuestionsClientPage initialVersions={versions} brands={brands} />;
}
