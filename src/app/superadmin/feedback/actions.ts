

'use server';

import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminDb, getAdminFieldValue } from "@/lib/firebase-admin";
import type { Feedback, FeedbackQuestionsVersion, OrderDetail, LanguageSetting } from '@/types';
import { getOrderById } from "@/app/checkout/order-actions";

/** RESULT TYPE FOR UI */
type ActionOk = { ok: true; id: string };
type ActionErr = { ok: false; error: string };
type ActionResult = ActionOk | ActionErr;

/** TYPES (uændret) */
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
  orderTypes: ("pickup" | "delivery")[];
  questions: Question[];
  createdAt?: any;
  updatedAt?: any;
};

/** createOrUpdateQuestionVersion — NO-THROW variant */
export async function createOrUpdateQuestionVersion(formData: FormData): Promise<ActionResult> {
  const adminDb = getAdminDb();
  const adminFieldValue = getAdminFieldValue();
  try {
    const id = (formData.get("id") as string) || undefined;
    const versionLabel = String(formData.get("versionLabel") || "").trim();
    const isActive = formData.get("isActive") === "on";
    const language = String(formData.get("language") || "da").trim();

    const orderTypes: ("pickup" | "delivery")[] = [];
    for (const [k, v] of formData.entries()) {
      if (k === "orderTypes" && typeof v === "string") {
        if (v === "pickup" || v === "delivery") orderTypes.push(v);
      }
    }

    let questions: Question[] = [];
    try {
      const q = formData.get("questions") as string;
      questions = q ? JSON.parse(q) : [];
    } catch (e) {
      // Catch JSON parse errors for empty or invalid strings
      console.error("[createOrUpdateQuestionVersion] JSON parse error:", e);
      // Default to empty array if parsing fails
      questions = [];
    }

    if (!versionLabel) return { ok: false, error: "Version label is required" };
    if (!Array.isArray(orderTypes) || orderTypes.length === 0)
      return { ok: false, error: "Select at least one order type" };

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
      console.log("[createOrUpdateQuestionVersion] UPDATE", { docPath: `feedbackQuestionsVersion/${id}` });
      await ref.set({ id, ...base }, { merge: true });
      return { ok: true, id };
    } else {
      const ref = await col.add({ ...base });
      await ref.set({ id: ref.id }, { merge: true });

      console.log("[createOrUpdateQuestionVersion] CREATE", {
        docPath: `feedbackQuestionsVersion/${ref.id}`,
        payload: { ...base, id: ref.id },
      });

      return { ok: true, id: ref.id };
    }
  } catch (e: any) {
    console.error("[createOrUpdateQuestionVersion] Firestore/Admin error:", {
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    return { ok: false, error: e?.message || "Failed to save question version" };
  }
}


// --- Keep other exports from the file ---

export async function getFeedbackEntries(): Promise<Feedback[]> {
    const db = getAdminDb();
    const q = db.collection('feedback').orderBy('receivedAt', 'desc');
    const querySnapshot = await q.get();
    const feedbackEntries: Feedback[] = querySnapshot.docs.map(doc => {
        const data = doc.data() as any;

        let receivedAt: Date | undefined;
        const rawReceivedAt = data.receivedAt;

        if (rawReceivedAt instanceof Date) {
            receivedAt = rawReceivedAt;
        } else if (rawReceivedAt && typeof (rawReceivedAt as any).toDate === 'function') {
            // Firestore Timestamp-like object
            receivedAt = (rawReceivedAt as any).toDate();
        } else if (rawReceivedAt) {
            // Fallback: attempt to construct a Date from string/number
            receivedAt = new Date(rawReceivedAt);
        } else {
            receivedAt = undefined;
        }

        return {
            ...data,
            id: doc.id,
            receivedAt,
        } as Feedback;
    });
    return feedbackEntries;
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
    const db = getAdminDb();
    const docRef = db.collection('feedback').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        const data = docSnap.data()!;
        
        let receivedAt: Date | undefined;
        const rawReceivedAt = data.receivedAt;

        if (rawReceivedAt instanceof Date) {
            receivedAt = rawReceivedAt;
        } else if (rawReceivedAt && typeof (rawReceivedAt as any).toDate === 'function') {
            receivedAt = (rawReceivedAt as any).toDate();
        } else if (rawReceivedAt) {
            receivedAt = new Date(rawReceivedAt);
        }

        return { 
            id: docSnap.id, 
            ...data,
            receivedAt,
        } as Feedback;
    }
    return null;
}

export async function updateFeedback(feedbackId: string, data: Partial<Pick<Feedback, 'showPublicly' | 'maskCustomerName' | 'internalNote'>>) {
    try {
        const db = getAdminDb();
        const feedbackRef = db.collection('feedback').doc(feedbackId);
        await feedbackRef.set(data, { merge: true });
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
    console.log(`[Action] Attempting to send feedback email for order: ${orderId}`);
    try {
        const order = await getOrderById(orderId);
        if (!order) {
            console.error(`Order with ID ${orderId} not found.`);
            return { error: 'Order not found.' };
        }
        
        const feedbackLink = `http://localhost:9002/feedback?orderId=${order.id}&customerId=${order.customerDetails.id}`;

        const email = {
            to: order.customerContact,
            from: 'feedback@orderfly.app',
            subject: `How was your order from ${order.brandName}?`,
            htmlBody: `
                <h1>Hi ${order.customerName},</h1>
                <p>Thanks for your recent order from ${order.brandName}!</p>
                <p>We'd love to get your feedback on order #${order.id}.</p>
                <a href="${feedbackLink}">Give Feedback</a>
                <p>Thanks,</p>
                <p>The ${order.brandName} Team</p>
            `
        };

        console.log("--- SIMULATING EMAIL ---");
        console.log(`To: ${email.to}`);
        console.log(`Subject: ${email.subject}`);
        console.log("Body:", email.htmlBody);
        console.log("------------------------");
        
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        return { success: true, message: `Simulated sending feedback email to ${email.to}. Check console for link.` };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        console.error(`Failed to send feedback email for order ${orderId}:`, e);
        return { error: errorMessage };
    }
}

export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup'
): Promise<FeedbackQuestionsVersion | null> {
  const db = getAdminDb();
  const q = db.collection('feedbackQuestionsVersion')
    .where('isActive', '==', true)
    .where('orderTypes', 'array-contains', deliveryType.toLowerCase());
  
  const snapshot = await q.get();
  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as FeedbackQuestionsVersion;
}

export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionsVersion[]> {
    const db = getAdminDb();
    const q = db.collection('feedbackQuestionsVersion').orderBy('versionLabel', 'desc');
    const snapshot = await q.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedbackQuestionsVersion));
}
