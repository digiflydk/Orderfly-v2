import { notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { FeedbackQuestionsVersion } from '@/types';
import { FeedbackQuestionVersionForm } from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const fromSettings: Lang[] | undefined =
    settings?.languageSettings?.supportedLanguages;

  // Robust fallback: bevar originalt design, men undgå undefined.map
  if (Array.isArray(fromSettings) && fromSettings.length > 0) {
    return fromSettings;
  }
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

async function getQuestionVersionById(id: string): Promise<FeedbackQuestionsVersion | null> {
  // ORIGINAL LOGIK (fra backup): loader version direkte fra 'feedbackQuestionsVersion'
  const docRef = doc(db, 'feedbackQuestionsVersion', id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...(data as any),
    } as FeedbackQuestionsVersion;
  }
  return null;
}

type PageProps = {
  params: { versionId: string };
};

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  // ORIGINALT MØNSTER: hent version + settings i parallel
  const [version, settings] = await Promise.all([
    getQuestionVersionById(params.versionId),
    getPlatformSettings(),
  ]);

  if (!version) {
    notFound();
  }

  const supportedLanguages = resolveSupportedLanguages(settings);

  return (
    <FeedbackQuestionVersionForm
      version={version as FeedbackQuestionsVersion}
      supportedLanguages={supportedLanguages}
    />
  );
}
