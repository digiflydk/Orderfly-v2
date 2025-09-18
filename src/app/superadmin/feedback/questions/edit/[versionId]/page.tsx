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

// 1) Normaliserer id fra URL: decode + fjern alle trailing dot(s) "…", der kan komme fra forkortet visning
function normalizeVersionId(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* ignore */ }
  return s.replace(/\.+$/, ''); // fjern en eller flere '.' i slutningen
}

// 2) Henter et dokument fra given collection; returnerer null hvis det ikke findes
async function getFromCollection(collectionName: string, id: string): Promise<FeedbackQuestionsVersion | null> {
  const ref = doc(db, collectionName, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, ...(data as any) } as FeedbackQuestionsVersion;
}

// 3) Prøv flere mulige collection-navne (vi kender ikke 100% jeres endelige navn i miljøet)
async function getQuestionVersionByIdAny(id: string): Promise<FeedbackQuestionsVersion | null> {
  const candidates = [
    'feedbackQuestionsVersion',   // singular (set ud fra backup)
    'feedbackQuestionsVersions',  // plural (mulig i nogle envs)
    'questionVersions',           // alternativt navn
  ];
  for (const col of candidates) {
    const v = await getFromCollection(col, id);
    if (v) return v;
  }
  return null;
}

type PageProps = { params: { versionId: string } };

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  const rawId = params.versionId;
  const normalizedId = normalizeVersionId(rawId);

  // Hent version + settings parallelt
  const [version, settings] = await Promise.all([
    getQuestionVersionByIdAny(normalizedId),
    getPlatformSettings(),
  ]);

  // DEBUG (kan fjernes efter verifikation)
  // console.debug('[OF-465] rawId=', rawId, 'normalizedId=', normalizedId, 'found=', !!version);

  if (!version) {
    // Hvis ikke fundet, vis 404 som hidtil (matcher oprindelig adfærd)
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
