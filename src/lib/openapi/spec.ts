// src/lib/openapi/spec.ts
import "server-only";
import { registry } from "@/lib/openapi/zod";
import { OpenApiGeneratorV31 } from "zod-to-openapi";

export function buildOpenApiSpec(baseUrl?: string) {
  const servers = baseUrl ? [{ url: baseUrl }] : [{ url: "/" }];

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const components = generator.generateComponents();

  return {
    openapi: "3.1.0",
    info: {
      title: "Orderfly API",
      version: "1.0.0",
      description:
        "Officiel API-dokumentation for Orderfly platformen. Alle schemas stammer fra Zod (single source of truth).",
    },
    servers,
    paths: {
      "/api/debug/all": {
        get: {
          summary: "System health / scoped debug",
          description:
            "Returnerer samlet systemstatus. Brug `?scope=feedback` (eller andre scopes) for specifik del.",
          parameters: [
            {
              name: "scope",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Begræns output til specifikt modul (fx feedback, menu, orders)",
            },
          ],
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      data: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          tags: ["debug"],
        },
      },
    },
    tags: [
      { name: "debug", description: "Drift/QA endpoints" },
      { name: "feedback", description: "Feedback / spørgeskemaer" },
    ],
    components: components.components,
  };
}
