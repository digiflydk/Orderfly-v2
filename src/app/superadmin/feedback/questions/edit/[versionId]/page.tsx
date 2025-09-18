import { notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import type { FeedbackQuestionsVersion } from '@/types';
import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type Lang = { code: string; name: string };

// --- helpers ---------------------------------------------------------------
function resolveSupportedLanguages(settings: any): Lang[] {
  const fromSettings: Lang[] | undefined = settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) return fromSettings;
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

function normalizeId(raw: string): string {
  let s = raw;
  try { s = decodeURIComponent(s); } catch {}
  s = s.trim();
  s = s.replace(/\.+$/, ''); // fjern evt. trailing “..”
  return s;
}

async function getByDocId(id: string): Promise<FeedbackQuestionsVersion | null> {
  const ref = doc(db, 'feedbackQuestionsVersion', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as FeedbackQuestionsVersion;
}

async function getByIdField(id: string): Promise<FeedbackQuestionsVersion | null> {
  const q = query(collection(db, 'feedbackQuestionsVersion'), where('id', '==', id));
  const qs = await getDocs(q);
  if (qs.empty) return null;
  const d = qs.docs[0];
  return { id: d.id, ...(d.data() as any) } as FeedbackQuestionsVersion;
}

async function getQuestionVersion(id: string): Promise<FeedbackQuestionsVersion | null> {
  // 1) direkte docId
  const byDoc = await getByDocId(id);
  if (byDoc) return byDoc;

  // 2) fallback: feltet `id`
  const byField = await getByIdField(id);
  if (byField) return byField;

  return null;
}

// --- page ------------------------------------------------------------------
type PageProps = { params: { versionId: string } };

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  const rawId = params.versionId;
  const normalizedId = normalizeId(rawId);

  // Hent data parallelt
  const [version, settings] = await Promise.all([
    getQuestionVersion(normalizedId),
    getPlatformSettings(),
  ]);

  // Debug (behold indtil vi har verificeret fixet)
  console.debug('[OF-467] edit version fetch', {
    rawId,
    normalizedId,
    found: Boolean(version),
    collection: 'feedbackQuestionsVersion',
  });

  if (!version) {
    // Hvis du fortsat rammer 404, matcher id’et ikke et doc i collection’en.
    // Tjek at URL’en indeholder et gyldigt docId fra Firestore (ikke en forkortet visning).
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
