import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import { NextResponse } from "next/server";

export async function GET() {
  const spec = {
    openapi: "3.1.0",
    info: { title: "Orderfly API (stub)", version: "1.0.0" },
    servers: [],
    paths: {},
    components: {},
  };
  return NextResponse.json(spec, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
