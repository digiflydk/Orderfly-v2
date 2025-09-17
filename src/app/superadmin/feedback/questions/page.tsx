import { getFeedbackQuestionVersions } from './actions';
import { FeedbackQuestionsClientPage } from '../client-page';

export default async function FeedbackQuestionsPage() {
  const versions = await getFeedbackQuestionVersions();
  return <FeedbackQuestionsClientPage initialVersions={versions as any} />;
}
