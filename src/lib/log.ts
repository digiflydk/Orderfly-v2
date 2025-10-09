// src/lib/log.ts
import { getAdminDb } from "@/lib/firebase-admin";

type LogLevel = "error" | "warn" | "info";

export async function logDiag(entry: {
  level?: LogLevel;
  scope: string;           // fx "brand-page"
  message: string;
  details?: any;
}) {
  try {
    const db = getAdminDb();
    const now = new Date();
    await db.collection("diag_logs").add({
      level: entry.level ?? "error",
      scope: entry.scope,
      message: entry.message,
      details: entry.details ?? null,
      createdAt: now,
    });
  } catch {
    // no-op: logging må aldrig kaste videre
  }
}
