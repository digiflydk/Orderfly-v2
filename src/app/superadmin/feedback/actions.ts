

'use server';

import "server-only";
import { redirect } from "next/navigation";
import { adminDb, adminFieldValue } from "@/lib/firebase-admin";
import { getOrderById } from '@/app/checkout/order-actions';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, getDoc, Timestamp, where, writeBatch } from 'firebase/firestore';
import type { Feedback, FeedbackQuestionsVersion, OrderDetail } from '@/types';


export async function getFeedbackEntries(): Promise<Feedback[]> {
    const q = query(collection(db, 'feedback'), orderBy('receivedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const feedbackEntries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            receivedAt: (data.receivedAt as any).toDate(),
        } as Feedback;
    });
    return feedbackEntries;
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
    const docRef = doc(db, 'feedback', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            ...data,
            receivedAt: (data.receivedAt as any).toDate(),
        } as Feedback;
    }
    return null;
}

export async function updateFeedback(feedbackId: string, data: Partial<Pick<Feedback, 'showPublicly' | 'maskCustomerName' | 'internalNote'>>) {
    try {
        const feedbackRef = doc(db, 'feedback', feedbackId);
        await setDoc(feedbackRef, data, { merge: true });
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
        await deleteDoc(doc(db, "feedback", id));
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

// --- Feedback Questions ---

// ---------- types ----------
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
  id?: string; // ved edit er dette docId
  versionLabel: string;
  isActive: boolean;
  language: string;
  orderTypes: ("pickup" | "delivery")[];
  questions: Question[];
  createdAt?: any;
  updatedAt?: any;
};

/** RESULT TYPE FOR UI */
type ActionOk = { ok: true; id: string };
type ActionErr = { ok: false; error: string };
type ActionResult = ActionOk | ActionErr;


// ---------- action ----------
export async function createOrUpdateQuestionVersion(formData: FormData): Promise<ActionResult> {
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
      questions = q ? (JSON.parse(q) as Question[]) : [];
    } catch (e) {
      console.error("[createOrUpdateQuestionVersion] JSON parse error:", e);
      return { ok: false, error: "Invalid questions payload" };
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

    const col = adminDb.collection("feedbackQuestionsVersion"); // jf. jeres DB

    if (id) {
      // EDIT
      const ref = col.doc(id);
      console.log("[createOrUpdateQuestionVersion] UPDATE", { docPath: `feedbackQuestionsVersion/${id}` });
      await ref.set({ id, ...base }, { merge: true });
      // returnér OK til UI — UI laver client-side redirect
      return { ok: true, id };
    } else {
      // CREATE
      const ref = await col.add({ ...base });
      await ref.set({ id: ref.id }, { merge: true });

      console.log("[createOrUpdateQuestionVersion] CREATE", {
        docPath: `feedbackQuestionsVersion/${ref.id}`,
      });

      return { ok: true, id: ref.id };
    }
  } catch (e: any) {
    // Log ALT server-side, men kast en pæn fejl til klienten
    console.error("[createOrUpdateQuestionVersion] Firestore error:", {
      message: e?.message,
      code: e?.code,
      stack: e?.stack,
    });
    return { ok: false, error: e?.message || "Failed to save question version" };
  }
}

function questionsParent() {
  return collection(db, 'feedbackConfig', 'default', 'questions');
}

type QuestionVersion = {
  id?: string;
  label?: string | null;
  name?: string | null;
  description?: string | null;
  language?: string | null;
  active?: boolean | null;
  orderTypes?: string[] | null;
  questions?: any[] | null;
  fields?: any;
  createdAt?: number | null;
  updatedAt?: number | null;
  parentId?: string | null;
};

function toMillis(v: any): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

function parseBoolean(v: FormDataEntryValue | null): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).toLowerCase().trim();
  if (['true', '1', 'on', 'yes'].includes(s)) return true;
  if (['false', '0', 'off', 'no'].includes(s)) return false;
  return null;
}

function parseJson(v: FormDataEntryValue | null): any {
  if (v == null) return undefined;
  try {
    return JSON.parse(String(v));
  } catch {
    return undefined;
  }
}

export async function getQuestionVersionById(id: string): Promise<QuestionVersion | null> {
  if (!id) return null;
  const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d: any = snap.data() ?? {};
    return {
      id,
      label: d.label ?? d.name ?? null,
      name: d.name ?? null,
      description: d.description ?? null,
      language: d.language ?? null,
      active: typeof d.active === 'boolean' ? d.active : null,
      orderTypes: Array.isArray(d.orderTypes) ? d.orderTypes : null,
      questions: Array.isArray(d.questions) ? d.questions : null,
      fields: d.fields,
      createdAt: toMillis(d.createdAt),
      updatedAt: toMillis(d.updatedAt),
      parentId: 'feedbackConfig/default',
    };
  }
  const g = collectionGroup(db, 'questions');
  const q = query(g, where(documentId(), '==', id), limit(1));
  const gr = await getDocs(q);
  if (!gr.empty) {
    const ds = gr.docs[0];
    const d: any = ds.data() ?? {};
    return {
      id: ds.id,
      label: d.label ?? d.name ?? null,
      name: d.name ?? null,
      description: d.description ?? null,
      language: d.language ?? null,
      active: typeof d.active === 'boolean' ? d.active : null,
      orderTypes: Array.isArray(d.orderTypes) ? d.orderTypes : null,
      questions: Array.isArray(d.questions) ? d.questions : null,
      fields: d.fields,
      createdAt: toMillis(d.createdAt),
      updatedAt: toMillis(d.updatedAt),
      parentId: ds.ref.parent?.parent?.id ?? null,
    };
  }
  return null;
}


// Form payload type spejler client-schema, men vi tillader ekstra felter
type CreateQuestionPayload = {
  title: string;
  helpText?: string;
  type: string;
  required: boolean;
  category?: string;
  language: string;
  isActive: boolean;
  options: { id: string; label: string; value: string }[];
} & Record<string, any>;

/**
 * Opretter et nyt spørgsmål (+ første version hvis jeres model anvender versions).
 * Matcher oprindelig adfærd: datafelter for question og options for choice-typer.
 */
export async function createFeedbackQuestion(payload: CreateQuestionPayload) {
  const questionsCol = collection(db, "feedbackQuestions");

  // Opret spørgsmål (root-doc)
  const qRef = await addDoc(questionsCol, {
    title: payload.title,
    helpText: payload.helpText ?? "",
    type: payload.type,
    required: !!payload.required,
    category: payload.category ?? "",
    language: payload.language,
    isActive: !!payload.isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // (Valgfri) initial version — hvis I bruger versions-subcollection
  const useVersions = true; // sæt til false hvis I IKKE bruger versions (ellers stop og spørg)
  if (useVersions) {
    const versionsCol = collection(qRef, "versions");
    await addDoc(versionsCol, {
      options: Array.isArray(payload.options) ? payload.options : [],
      isActive: !!payload.isActive,
      language: payload.language,
      createdAt: serverTimestamp(),
    });
  }

  return { id: qRef.id };
}

// Valgfrit (beholdt for kompatibilitet hvis edit-siden bruger den)
export async function updateFeedbackQuestion(id: string, payload: CreateQuestionPayload) {
  // Implementeres i separat opgave hvis nødvendigt — ikke påkrævet for at genskabe NEW-siden.
  throw new Error("updateFeedbackQuestion not implemented in OF-457");
}

export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup'
): Promise<FeedbackQuestionsVersion | null> {
  const q = query(
    collection(db, 'feedbackQuestionsVersion'), 
    where('isActive', '==', true),
    where('orderTypes', 'array-contains', deliveryType.toLowerCase())
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  // Assuming only one version is active per language/type combo
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as FeedbackQuestionsVersion;
}
