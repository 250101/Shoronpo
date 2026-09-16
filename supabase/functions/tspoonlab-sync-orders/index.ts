import { createClient } from "npm:@supabase/supabase-js@2";
import {
  TspoonlabClient,
  TspoonlabError,
} from "../_shared/tspoonlab-client.ts";
import {
  mapDeliveries,
  mapOrder,
  mapOrderLines,
} from "../_shared/tspoonlab-order.ts";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
async function equal(a: string, b: string) {
  const e = new TextEncoder(),
    [x, y] = await Promise.all([
      crypto.subtle.digest("SHA-256", e.encode(a)),
      crypto.subtle.digest("SHA-256", e.encode(b)),
    ]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < aa.length; i++) d |= aa[i] ^ bb[i];
  return d === 0;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const secret = Deno.env.get("SHORONPO_SYNC_TRIGGER_SECRET") ?? "",
    supplied = req.headers.get("x-shoronpo-sync-key") ?? "";
  if (!secret || !supplied || !(await equal(secret, supplied))) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }
  const key = req.headers.get("x-idempotency-key")?.trim() ?? "",
    start = Number(req.headers.get("x-page-start") ?? "0");
  if (
    key.length < 8 || key.length > 200 || !Number.isInteger(start) || start < 0
  ) return json({ error: "INVALID_REQUEST" }, 400);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: old } = await db.from("tspoon_sync_runs").select(
    "id,status,records_processed",
  ).eq("request_key", key).maybeSingle();
  if (old) {
    return json({ ok: old.status === "SUCCEEDED", duplicate: true, run: old });
  }
  const { data: run, error: ce } = await db.from("tspoon_sync_runs").insert({
    request_key: key,
    block: "ORDER",
    status: "RUNNING",
    trigger_type: "MANUAL",
  }).select("id").single();
  if (ce || !run) return json({ ok: false, status: "RUN_CREATE_FAILED" }, 500);
  let processed = 0;
  try {
    const client = new TspoonlabClient(
        Deno.env.get("TSPOONLAB_REMEMBERME") ?? "",
        { timezone: "Europe/Madrid" },
      ),
      headers = await client.listOrders(start, 25);
    for (let o = 0; o < headers.length; o += 5) {
      const details = await Promise.all(
        headers.slice(o, o + 5).map((x) => client.getOrder(String(x.id ?? ""))),
      );
      for (const detail of details) {
        const order = mapOrder(detail, run.id),
          deliveries = mapDeliveries(detail, run.id);
        let e = (await db.from("tspoon_orders").upsert(order)).error;
        if (e) throw new Error("ORDER_WRITE_FAILED");
        for (const delivery of deliveries) {
          e = (await db.from("tspoon_order_deliveries").upsert(delivery)).error;
          if (e) throw new Error("DELIVERY_WRITE_FAILED");
          e = (await db.from("tspoon_order_lines").delete().eq(
            "delivery_external_id",
            delivery.external_id,
          )).error;
          if (e) throw new Error("LINE_DELETE_FAILED");
          const rawDeliveryId = delivery.external_id.slice(
              `${order.external_id}:`.length,
            ),
            source = (detail as { listComandes: unknown[] }).listComandes
              .find((x) => (x as Record<string, unknown>).id === rawDeliveryId),
            lines = mapOrderLines(source, run.id, order.external_id);
          if (lines.length) {
            e = (await db.from("tspoon_order_lines").insert(lines)).error;
            if (e) throw new Error("LINE_WRITE_FAILED");
          }
        }
        processed++;
      }
    }
    await db.from("tspoon_sync_runs").update({
      status: "SUCCEEDED",
      records_processed: processed,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    return json({
      ok: true,
      runId: run.id,
      pageStart: start,
      ordersProcessed: processed,
      hasMore: headers.length === 25,
    });
  } catch (error) {
    const raw = error instanceof TspoonlabError
        ? error.code
        : error instanceof Error
        ? error.message
        : "SYNC_FAILED",
      code = [
          "AUTH_EXPIRED",
          "FORBIDDEN",
          "RATE_LIMITED",
          "UPSTREAM_ERROR",
          "NETWORK_ERROR",
          "INVALID_RESPONSE",
          "ORDER_WRITE_FAILED",
          "DELIVERY_WRITE_FAILED",
          "LINE_DELETE_FAILED",
          "LINE_WRITE_FAILED",
        ].includes(raw)
        ? raw
        : "SYNC_FAILED";
    await db.from("tspoon_sync_errors").insert({
      run_id: run.id,
      code,
      message: code,
    });
    await db.from("tspoon_sync_runs").update({
      status: "FAILED",
      records_processed: processed,
      finished_at: new Date().toISOString(),
      error_code: code,
    }).eq("id", run.id);
    return json(
      { ok: false, status: code, runId: run.id },
      code === "AUTH_EXPIRED" ? 401 : 503,
    );
  }
});
