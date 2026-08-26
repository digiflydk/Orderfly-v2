'use server';

import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";
import type { Feedback, FeedbackQuestionsVersion } from '@/types';
import type { ExperienceFeedbackQuestionsVersion, FeedbackExperienceType } from '@/lib/feedback/source-types';
import { getOrderById } from "@/app/checkout/order-actions";

/** RESULT TYPE FOR UI */
type ActionOk = { ok: true; id: string };
type ActionErr = { ok: false; error: string };
type ActionResult = ActionOk | ActionErr;

type QuestionOption = { id: string; label: string };
type Question = {
  questionId: string;
  label: string;
  type: "stars" | "nps" | "text" | "tags" | "multiple_options";
  isRequired: boolean;
  options?: QuestionOption[];
  minSelection?: number;
  maxSelection?: number;
};

type VersionPayload = {
  id?: string;
  versionLabel: string;
  isActive: boolean;
  language: string;
  orderTypes: FeedbackExperienceType[];
  questions: Question[];
  createdAt?: any;
  updatedAt?: any;
};

export async function createOrUpdateQuestionVersion(formData: FormData): Promise<ActionResult> {
  const adminDb = getAdminDb();
  const adminFieldValue = getAdminFieldValue();
  try {
    const id = (formData.get("id") as string) || undefined;
    const versionLabel = String(formData.get("versionLabel") || "").trim();
    const isActive = formData.get("isActive") === "on";
    const language = String(formData.get("language") || "da").trim();

    const orderTypes: FeedbackExperienceType[] = [];
    for (const [k, v] of formData.entries()) {
      if (k === "orderTypes" && typeof v === "string") {
        if (v === "pickup" || v === "delivery" || v === "booking") orderTypes.push(v);
      }
    }

    let questions: Question[] = [];
    try {
      const q = formData.get("questions") as string;
      questions = q ? JSON.parse(q) : [];
    } catch (e) {
      console.error("[createOrUpdateQuestionVersion] JSON parse error:", e);
      questions = [];
    }

    if (!versionLabel) return { ok: false, error: "Version label is required" };
    if (!Array.isArray(orderTypes) || orderTypes.length === 0)
      return { ok: false, error: "Select at least one experience type" };

    const base: Omit<VersionPayload, "id"> = {
      versionLabel,
      isActive,
      language,
      orderTypes,
      questions,
      createdAt: adminFieldValue.serverTimestamp(),
      updatedAt: adminFieldValue.serverTimestamp(),
    };

    const col = adminDb.collection("feedbackQuestionsVersion");

    if (id) {
      const ref = col.doc(id);
      await ref.set({ id, ...base }, { merge: true });
      return { ok: true, id };
    }

    const ref = await col.add({ ...base });
    await ref.set({ id: ref.id }, { merge: true });
    return { ok: true, id: ref.id };
  } catch (e: any) {
    console.error("[createOrUpdateQuestionVersion] Firestore/Admin error:", {
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    return { ok: false, error: e?.message || "Failed to save question version" };
  }
}

export async function getFeedbackEntries(): Promise<Feedback[]> {
  const db = getAdminDb();
  const q = db.collection('feedback').orderBy('receivedAt', 'desc');
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => {
    const data = doc.data() as any;
    const rawReceivedAt = data.receivedAt;
    const receivedAt = rawReceivedAt instanceof Date
      ? rawReceivedAt
      : rawReceivedAt && typeof rawReceivedAt.toDate === 'function'
        ? rawReceivedAt.toDate()
        : rawReceivedAt
          ? new Date(rawReceivedAt)
          : undefined;
    return { ...data, id: doc.id, receivedAt } as Feedback;
  });
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
  const db = getAdminDb();
  const docSnap = await db.collection('feedback').doc(id).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data()!;
  const rawReceivedAt = data.receivedAt;
  const receivedAt = rawReceivedAt instanceof Date
    ? rawReceivedAt
    : rawReceivedAt && typeof rawReceivedAt.toDate === 'function'
      ? rawReceivedAt.toDate()
      : rawReceivedAt
        ? new Date(rawReceivedAt)
        : undefined;
  return { id: docSnap.id, ...data, receivedAt } as Feedback;
}

export async function updateFeedback(feedbackId: string, data: Partial<Pick<Feedback, 'showPublicly' | 'maskCustomerName' | 'internalNote'>>) {
  try {
    const db = getAdminDb();
    await db.collection('feedback').doc(feedbackId).set(data, { merge: true });
    revalidatePath(`/superadmin/feedback`);
    revalidatePath(`/superadmin/feedback/${feedbackId}`);
    return { message: "Feedback updated successfully.", error: false };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update feedback: ${errorMessage}`, error: true };
  }
}

export async function deleteFeedback(id: string) {
  try {
    const db = getAdminDb();
    await db.collection("feedback").doc(id).delete();
    revalidatePath("/superadmin/feedback");
    return { message: "Feedback deleted successfully.", error: false };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to delete feedback: ${errorMessage}`, error: true };
  }
}

export async function sendFeedbackRequestEmail(orderId: string) {
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: 'Order not found.' };

    const baseUrl = (process.env.ORDERFLY_PUBLIC_BASE_URL || 'https://orderfly.dk').replace(/\/+$/, '');
    const feedbackLink = `${baseUrl}/feedback?orderId=${encodeURIComponent(order.id)}&customerId=${encodeURIComponent(order.customerDetails.id)}`;

    console.log('[feedback] simulated commerce-order request', {
      orderId: order.id,
      to: order.customerContact,
      feedbackLink,
    });

    revalidatePath(`/superadmin/sales/orders/${orderId}`);
    return { success: true, message: `Simulated sending feedback email to ${order.customerContact}.` };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { error: errorMessage };
  }
}

export async function getActiveFeedbackQuestionsForExperience(
  experienceType: FeedbackExperienceType,
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  const db = getAdminDb();
  const snapshot = await db.collection('feedbackQuestionsVersion')
    .where('isActive', '==', true)
    .where('orderTypes', 'array-contains', experienceType)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as ExperienceFeedbackQuestionsVersion;
}

export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup'
): Promise<FeedbackQuestionsVersion | null> {
  return await getActiveFeedbackQuestionsForExperience(deliveryType.toLowerCase() as 'pickup' | 'delivery') as FeedbackQuestionsVersion | null;
}

export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionsVersion[]> {
  const db = getAdminDb();
  const snapshot = await db.collection('feedbackQuestionsVersion').orderBy('versionLabel', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedbackQuestionsVersion));
}
