import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { DOC_WHITELIST } from "@/lib/docs/whitelist";

export async function GET() {
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  return NextResponse.json({ ok: true, files: DOC_WHITELIST });
}
