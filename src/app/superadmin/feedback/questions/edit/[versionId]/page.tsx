
export const runtime = "nodejs";

import { notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { FeedbackQuestionsVersion } from '@/types';
import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const from = settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(from) && from.length > 0) return from as Lang[];
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

function normalizeId(raw: string): string {
  try { return decodeURIComponent(raw).trim().replace(/\.+$/, ""); } catch { return raw.trim().replace(/\.+$/, ""); }
}

async function getByDocId(id: string) {
  const ref = doc(db, "feedbackQuestionsVersion", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) } as FeedbackQuestionsVersion;
}
async function getByIdField(id: string) {
  const qs = await getDocs(query(collection(db, "feedbackQuestionsVersion"), where("id", "==", id)));
  if (qs.empty) return null;
  const d = qs.docs[0];
  return { id: d.id, ...(d.data() as any) } as FeedbackQuestionsVersion;
}

type PageProps = { params: { versionId: string } };

export default async function EditFeedbackQuestionVersionPage({ params }: PageProps) {
  const normalizedId = normalizeId(params.versionId);
  const [version, settings] = await Promise.all([
    (async () => (await getByDocId(normalizedId)) ?? (await getByIdField(normalizedId)))(),
    getPlatformSettings(),
  ]);
  if (!version) notFound();
  const supportedLanguages = resolveSupportedLanguages(settings);
  return <FeedbackQuestionVersionForm version={version as FeedbackQuestionsVersion} supportedLanguages={supportedLanguages} />;
}
