
import { notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { FeedbackQuestionsVersion } from '@/types';
import { FeedbackQuestionVersionForm } from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

async function getQuestionVersionById(id: string): Promise<FeedbackQuestionsVersion | null> {
    const docRef = doc(db, 'feedbackQuestionsVersion', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            ...data,
        } as FeedbackQuestionsVersion;
    }
    return null;
}

export default async function EditFeedbackQuestionVersionPage({ params }: { params: { versionId: string } }) {
    if (!params.versionId) {
        notFound();
    }
    
    const [version, settings] = await Promise.all([
        getQuestionVersionById(params.versionId),
        getPlatformSettings(),
    ]);

    if (!version) {
        notFound();
    }
    
    return (
        <FeedbackQuestionVersionForm 
            version={version} 
            supportedLanguages={settings.languageSettings.supportedLanguages} 
        />
    );
}
