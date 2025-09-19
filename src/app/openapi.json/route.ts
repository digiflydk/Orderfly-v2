import "server-only";
import { NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi/spec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;
  const spec = buildOpenApiSpec(base);
  return NextResponse.json(spec, { status: 200 });
}
