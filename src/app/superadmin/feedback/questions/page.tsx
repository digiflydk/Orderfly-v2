import { getFeedbackQuestionVersions } from "./actions";
import FeedbackQuestionsClientPage from "./client-page";
import { requireQuestionAccess } from '@/lib/feedback/access';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';

export default async function FeedbackQuestionsPage() {
  const access = await requireQuestionAccess();
  const [versions, options] = await Promise.all([getFeedbackQuestionVersions(), feedbackScopeOptions(access)]);
  return <FeedbackQuestionsClientPage initialVersions={versions} brands={options.brands} />;
}
