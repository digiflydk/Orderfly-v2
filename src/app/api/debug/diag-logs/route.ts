
// src/app/api/debug/diag-logs/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

/**
 * GET /api/debug/diag-logs?limit=10&scope=brand-page
 * - Uden scope: orderBy(createdAt desc) + limit (hurtigst)
 * - Med scope: undgå composite index ved at hente uden orderBy og sortere i memory
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 10), 100);
  const scope = url.searchParams.get("scope")?.trim();

  try {
    const db = getAdminDb();

    // Hurtig sti: ingen scope -> kræver kun single-field index på createdAt
    if (!scope) {
      const snap = await db
        .collection("diag_logs")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ ok: true, count: items.length, scope: "all", items }, { status: 200 });
    }

    // Scope angivet -> undgå composite index (scope+createdAt) ved at droppe orderBy og sortere i memory
    const scopedSnap = await db
      .collection("diag_logs")
      .where("scope", "==", scope)
      // ingen orderBy her -> ingen composite index krævet
      .limit(limit)
      .get();

    // Sortér i memory på createdAt desc (hvis feltet mangler, push til slut)
    const items = scopedSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => {
        const ta = (a?.createdAt?.toMillis?.() ?? new Date(a?.createdAt ?? 0).getTime()) || 0;
        const tb = (b?.createdAt?.toMillis?.() ?? new Date(b?.createdAt ?? 0).getTime()) || 0;
        return tb - ta;
      });

    return NextResponse.json({ ok: true, count: items.length, scope, items }, { status: 200 });
  } catch (err: any) {
    const msg = String(err?.message ?? err);

    // Ekstra failsafe: hvis nogen miljøer alligevel rammer composite-krav, så fallback til "ingen orderBy"
    if (msg.includes("FAILED_PRECONDITION") && msg.includes("requires an index")) {
      try {
        const db = getAdminDb();
        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get("limit") || 10), 100);
        const scope = url.searchParams.get("scope")?.trim();

        if (scope) {
          const snap = await db.collection("diag_logs").where("scope", "==", scope).limit(limit).get();
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          return NextResponse.json({ ok: true, count: items.length, scope, items, fallback: true }, { status: 200 });
        }
      } catch (e2: any) {
        return NextResponse.json({ ok: false, error: String(e2?.message ?? e2) }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
