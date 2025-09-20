import { getAdminDb } from "@/lib/firebase-admin";

/**
 * Returnerer true hvis debug snapshot eksport er tilladt.
 * Kilder: ENV (hurtig), Firestore setting (granulær).
 */
export async function isDebugSnapshotEnabled(): Promise<boolean> {
  // 1) Env vinder altid
  const env = process.env.DEBUG_EXPORT_ENABLED;
  if (typeof env === "string") {
    const v = env.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }

  // 2) Firestore setting (settings/debug.allowSnapshotExports: boolean)
  try {
    const db = getAdminDb();
    const snap = await db.doc("settings/debug").get();
    const allow = snap.exists ? (snap.data() as any)?.allowSnapshotExports : undefined;
    if (typeof allow === "boolean") return allow;
  } catch {
    // ignorer læsefejl → gå til fallback
  }

  // 3) Fallback: OFF i production, ON i development
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  return nodeEnv !== "production";
}
