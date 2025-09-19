// src/app/openapi.json/route.ts
import "server-only";
export const runtime = "nodejs";            // ikke edge
export const dynamic = "force-dynamic";     // ingen SSG af denne route
export const fetchCache = "default-no-store";

import { NextResponse } from "next/server";
import { registry } from "@/lib/openapi/zod";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

/**
 * Sæt til true for at bruge en minimal stub (nød-unblock),
 * hvis der stadig opstår build-fejl pga. 3.-parts libs.
 */
const USE_STUB = false;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;

  if (USE_STUB) {
    // --- NØD-STUB: minimal spec uden zod-to-openapi (build kan altid lykkes)
    const spec = {
      openapi: "3.1.0",
      info: { title: "Orderfly API (stub)", version: "1.0.0" },
      servers: [{ url: base }],
      paths: { "/api/debug/all": { get: { summary: "Debug", responses: { "200": { description: "OK" }}}}},
      components: {},
    };
    return NextResponse.json(spec);
  }

  // --- Rigtig generering via registry
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const components = generator.generateComponents();

  const spec = {
    openapi: "3.1.0",
    info: { title: "Orderfly API", version: "1.0.0" },
    servers: [{ url: base }],
    paths: {},                 // Tilføj/udvid ved behov
    components: components.components,
  };

  return NextResponse.json(spec);
}
