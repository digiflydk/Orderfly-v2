
// src/app/api/debug/diag-logs/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

/**
 * Returnerer de seneste diag_logs fra Firestore
 * Bruges til fejlfinding, især brand-page / menu-load fejl
 * Tilgå via: /api/debug/diag-logs
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || 10);
  const scope = url.searchParams.get("scope"); // fx scope=brand-page

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection("diag_logs").orderBy("createdAt", "desc").limit(limit);
    if (scope) {
        query = query.where("scope", "==", scope);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json(
      {
        ok: true,
        count: items.length,
        scope: scope || "all",
        items,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
