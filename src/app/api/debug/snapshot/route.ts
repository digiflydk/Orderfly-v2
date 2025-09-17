import { NextResponse } from "next/server";
import { getDebugToken, DEBUG_ENABLED, isProd } from "@/config/debug";
import { listCollection, getEnvInfo } from "@/services/debug";

export async function GET(request: Request) {
  if (!DEBUG_ENABLED) return new NextResponse("Disabled", { status: 403 });

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const path = url.searchParams.get("path") || "";
  const pageSize = Number(url.searchParams.get("limit") || "");
  const afterId = url.searchParams.get("after") || null;
  const orderByCreatedAt = url.searchParams.get("orderByCreatedAt") !== "false";

  if (!getDebugToken() || token !== getDebugToken()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (isProd()) {
    // I prod må API kun bruges med eksplicit godkendelse. Returnér 403 by default.
    return new NextResponse("Forbidden in production", { status: 403 });
  }
  if (!path) {
    return NextResponse.json({ ok: true, env: getEnvInfo() });
  }
  const data = await listCollection({ path, pageSize: Number.isFinite(pageSize) ? pageSize : undefined, afterId, orderByCreatedAt });
  return NextResponse.json({ env: getEnvInfo(), ...data });
}
