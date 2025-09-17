
"use server";

import { db } from "@/lib/firebase";
import { collection, getDocs, limit, orderBy, query, startAfter, doc, getDoc } from "firebase/firestore";
import { DEBUG_COLLECTIONS, DEBUG_DEFAULT_PAGE_SIZE, DEBUG_MASK_FIELDS } from "@/config/debug";

function maskValue(v: any) {
  if (typeof v === "string") return "•••";
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  return null;
}
function maskDoc(d: any): any {
  if (!d || typeof d !== "object") return d;
  const out: any = Array.isArray(d) ? [] : {};
  for (const k of Object.keys(d)) {
    const val = (d as any)[k];
    const lower = k.toLowerCase();
    const shouldMask = DEBUG_MASK_FIELDS.some(f => lower.includes(f.toLowerCase()));
    if (shouldMask) {
      out[k] = maskValue(val);
    } else if (val && typeof val === "object" && !("toDate" in val) && !(("seconds" in val) && ("nanoseconds" in val))) {
      out[k] = maskDoc(val);
    } else {
      out[k] = val;
    }
  }
  return out;
}

export type DebugListRequest = {
  path: string;
  pageSize?: number;
  afterId?: string | null;
  orderByCreatedAt?: boolean;
};
export type DebugListResponse = {
  ok: boolean;
  path: string;
  items: any[];
  nextCursor: string | null;
  orderedByCreatedAt: boolean;
};

export async function listCollection(req: DebugListRequest): Promise<DebugListResponse> {
  const path = req.path;
  const pageSize = Math.min(req.pageSize || DEBUG_DEFAULT_PAGE_SIZE, 200);
  if (!DEBUG_COLLECTIONS.includes(path)) {
    return { ok: false, path, items: [], nextCursor: null, orderedByCreatedAt: false };
  }

  const col = collection(db, path);
  let qRef: any;
  let ordered = true;

  try {
    if (req.orderByCreatedAt !== false) {
      if (req.afterId) {
        const afterDoc = await getDoc(doc(db, path, req.afterId));
        qRef = query(col, orderBy("createdAt", "desc"), startAfter(afterDoc), limit(pageSize));
      } else {
        qRef = query(col, orderBy("createdAt", "desc"), limit(pageSize));
      }
    } else {
      ordered = false;
      qRef = query(col, limit(pageSize));
    }
  } catch {
    ordered = false;
    qRef = query(col, limit(pageSize));
  }

  const snap = await getDocs(qRef);
  const itemsRaw: any[] = [];
  snap.forEach(d => itemsRaw.push({ id: d.id, ...d.data() }));
  const items = itemsRaw.map(maskDoc);
  const nextCursor = itemsRaw.length ? itemsRaw[itemsRaw.length - 1].id : null;

  return { ok: true, path, items, nextCursor, orderedByCreatedAt: ordered };
}
