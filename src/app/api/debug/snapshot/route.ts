
import { NextResponse } from "next/server";
import { getDebugToken, DEBUG_ENABLED, isProd } from "@/config/debug";
import { listCollection } from "@/services/debug.server";
import { getEnvInfo } from "@/lib/env";

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
    return new NextResponse("Forbidden in production", { status: 403 });
  }

  if (!path) {
    const env = getEnvInfo();
    return NextResponse.json({ ok: true, env });
  }

  const data = await listCollection({
    path,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    afterId,
    orderByCreatedAt
  });

  const env = getEnvInfo();
  return NextResponse.json({ env, ...data });
}
