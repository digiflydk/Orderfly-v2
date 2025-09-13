
import { FeedbackQuestionVersionForm } from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

export default async function NewFeedbackQuestionVersionPage() {
    const settings = await getPlatformSettings();
    return (
        <FeedbackQuestionVersionForm 
            supportedLanguages={settings.languageSettings.supportedLanguages} 
        />
    );
}
