// src/lib/openapi/spec.ts
import "server-only";

/**
 * Minimal, håndskrevet OpenAPI 3.1 spec der dækker vores nuværende endpoints.
 * Senere kan vi erstatte/udvide med zod-to-openapi, så schemaer kommer fra Zod.
 */
export function buildOpenApiSpec(baseUrl?: string) {
  const servers = baseUrl ? [{ url: baseUrl }] : [{ url: "/" }];

  return {
    openapi: "3.1.0",
    info: {
      title: "Orderfly API",
      version: "1.0.0",
      description:
        "Officiel API-dokumentation for Orderfly platformens endpoints (debug & admin endpoints).",
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
              schema: { type: "string", example: "feedback" },
              description: "Begræns output til et specifikt modul (fx feedback, menu, orders).",
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
                      timestamp: { type: "string", format: "date-time" },
                      elapsedMs: { type: "number" },
                      data: { type: "object" }, // uddybes løbende via zod-to-openapi senere
                    },
                  },
                  examples: {
                    full: {
                      summary: "Fuldt svar",
                      value: {
                        ok: true,
                        timestamp: "2025-09-19T12:00:00Z",
                        elapsedMs: 42,
                        data: {
                          feedback: { ok: true, count: 25, latest: [] },
                          settingsGeneral: { ok: true, exists: true, path: "settings/general", raw: {} },
                        },
                      },
                    },
                    scoped: {
                      summary: "Scope: feedback",
                      value: {
                        ok: true,
                        timestamp: "2025-09-19T12:00:00Z",
                        elapsedMs: 10,
                        data: { feedback: { ok: true, count: 25, latest: [] } },
                      },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Fejl i backend",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          tags: ["debug"],
        },
      },
      // Eksempel for fremtidige endpoints — tilføj her efter behov:
      // "/api/feedback/versions": { get: { ... }, post: { ... } }
    },
    tags: [
      { name: "debug", description: "Drift/QA endpoints for system health & introspection." },
    ],
    components: {
      schemas: {
        // Her kan vi fremover samle Zod-afledte schemas (fx FeedbackQuestionsVersion)
      },
    },
  };
}
