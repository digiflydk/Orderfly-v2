// src/lib/openapi/spec.ts
import "server-only";
import { registry } from "@/lib/openapi/zod";
import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

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
        "Officiel API-dokumentation for Orderfly platformen. Schemas genereres fra Zod.",
    },
    servers,
    paths: {
      "/api/debug/all": {
        get: {
          summary: "System health / scoped debug",
          parameters: [
            {
              name: "scope",
              in: "query",
              required: false,
              schema: { type: "string" },
              description:
                "Begræns output til specifikt modul (fx feedback, menu, orders)",
            },
          ],
          responses: { "200": { description: "OK" } },
          tags: ["debug"],
        },
      },
    },
    tags: [{ name: "debug", description: "Drift/QA endpoints" }],
    components: components.components,
  };
}
