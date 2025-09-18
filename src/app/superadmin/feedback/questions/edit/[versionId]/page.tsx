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

// ---------- helpers ----------
type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const fromSettings: Lang[] | undefined = settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) return fromSettings;
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

function normalizeId(raw: string): string {
  // decode + trim + fjern trailing dots (kommer ofte fra “forkortet” UI-visning)
  let s = raw;
  try { s = decodeURIComponent(s); } catch {}
  s = s.trim();
  s = s.replace(/\.+$/, ''); // fjern alle '.' i slutningen
  return s;
}

async function getByDocId(colName: string, id: string): Promise<FeedbackQuestionsVersion | null> {
  const ref = doc(db, colName, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as FeedbackQuestionsVersion;
}

// fallback: nogle steder gemmer vi også id som felt i dokumentet
async function getByIdField(colName: string, id: string): Promise<FeedbackQuestionsVersion | null> {
  const q = query(collection(db, colName), where('id', '==', id));
  const qs = await getDocs(q);
  if (qs.empty) return null;
  const d = qs.docs[0];
  return { id: d.id, ...(d.data() as any) } as FeedbackQuestionsVersion;
}

async function getQuestionVersion(colName: string, id: string): Promise<FeedbackQuestionsVersion | null> {
  // 1) docId
  const byDoc = await getByDocId(colName, id);
  if (byDoc) return byDoc;
  // 2) fallback via field 'id'
  const byField = await getByIdField(colName, id);
  if (byField) return byField;
  return null;
}

// ---------- page ----------
type PageProps = { params: { versionId: string } };

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  const rawId = params.versionId;
  const normalizedId = normalizeId(rawId);

  // Vores collection-navn ER (jf. screenshot): feedbackQuestionsVersion
  const [version, settings] = await Promise.all([
    getQuestionVersion('feedbackQuestionsVersion', normalizedId),
    getPlatformSettings(),
  ]);

  if (!version) {
    // Debug-tip (kan kommenteres ind ved behov):
    // console.debug('[OF-466] Not found. rawId:', rawId, 'normalizedId:', normalizedId);
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
