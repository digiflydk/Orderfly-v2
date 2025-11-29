// src/app/api/superadmin/kpis/route.ts
// Legacy superadmin KPIs endpoint disabled for this build.
// Kept as a no-op placeholder to avoid breaking the route path.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { error: "KPIs endpoint is disabled in this build." },
    { status: 501 }
  );
}
