import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { processOrderflyCustomerSyncJobs } from "../_shared/orderfly-customer-sync.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const brandIdPattern = /^[a-zA-Z0-9_-]{1,160}$/;

function validIntegrationSecret(supplied: string | null): boolean {
  const expected = Deno.env.get("ORDERFLY_ESMERALDA_INTEGRATION_SECRET") || "";
  if (expected.length < 32 || !supplied || supplied.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!validIntegrationSecret(request.headers.get("x-esmeralda-integration-secret"))) {
    return json({ error: "Unauthorized" }, 401);
  }
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Expected JSON" }, 400);
  }

  const raw = await request.text();
  if (raw.length > 1024) return json({ error: "Invalid request" }, 400);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid request" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request" }, 400);
  const data = body as Record<string, unknown>;
  if (Object.keys(data).length !== 1 || typeof data.brandId !== "string" || !brandIdPattern.test(data.brandId)) {
    return json({ error: "Invalid brand scope" }, 400);
  }

  const baseUrl = String(Deno.env.get("ORDERFLY_INTEGRATION_BASE_URL") || "").trim();
  if (!/^https:\/\//i.test(baseUrl) || !Deno.env.get("ORDERFLY_ESMERALDA_INTEGRATION_SECRET")) {
    return json({ error: "Orderfly integration is not configured" }, 503);
  }

  const { data: mapping, error: mappingError } = await db.from("orderfly_organization_mappings")
    .select("organization_id")
    .eq("orderfly_brand_id", data.brandId)
    .eq("is_active", true)
    .maybeSingle();
  if (mappingError) return json({ error: "Brand mapping lookup failed" }, 503);
  if (!mapping) return json({ error: "Active brand mapping not found" }, 404);

  const { data: locations, error: locationError } = await db.from("orderfly_location_mappings")
    .select("restaurant_location_id")
    .eq("organization_id", mapping.organization_id)
    .eq("is_active", true);
  if (locationError) return json({ error: "Location mapping lookup failed" }, 503);
  if (!locations?.length) return json({ error: "Active location mapping not found" }, 409);

  const { data: enqueued, error: enqueueError } = await db.rpc("orderfly_backfill_booking_customer_sync", {
    p_organization_id: mapping.organization_id,
    p_since: null,
    p_limit: 5000,
  });
  if (enqueueError) return json({ error: "Booking customer backfill failed" }, 503);

  let processed = 0;
  let succeededCount = 0;
  try {
    const result = await processOrderflyCustomerSyncJobs(db, mapping.organization_id, 5);
    processed = result.processed;
    succeededCount = result.results.filter((item: { status?: string }) => item.status === "succeeded" || item.status === "already_linked").length;
  } catch {
    // The queue remains durable and the scheduled worker will retry it.
  }

  const { count, error: pendingError } = await db.from("orderfly_customer_sync_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", mapping.organization_id)
    .eq("status", "pending");
  if (pendingError) return json({ error: "Booking queue status is unavailable" }, 503);

  return json({
    success: true,
    brandId: data.brandId,
    enqueued: Number(enqueued) || 0,
    processed,
    succeededCount,
    pending: Number(count) || 0,
  });
});
