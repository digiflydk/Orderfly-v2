import { notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { FeedbackQuestionsVersion } from '@/types';
import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const fromSettings: Lang[] | undefined =
    settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) return fromSettings;
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

async function getQuestionVersionById(id: string): Promise<FeedbackQuestionsVersion | null> {
  const ref = doc(db, 'feedbackQuestionsVersion', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    return { id: snap.id, ...(data as any) } as FeedbackQuestionsVersion;
  }
  return null;
}

type PageProps = { params: { versionId: string } };

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  const [version, settings] = await Promise.all([
    getQuestionVersionById(params.versionId),
    getPlatformSettings(),
  ]);

  if (!version) notFound();

  const supportedLanguages = resolveSupportedLanguages(settings);

  return (
    <FeedbackQuestionVersionForm
      version={version as FeedbackQuestionsVersion}
      supportedLanguages={supportedLanguages}
    />
  );
}
