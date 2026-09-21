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
    trigger_type: key.startsWith("scheduled-") ? "SCHEDULED" : "MANUAL",
  }).select("id").single();
  if (ce || !run) return json({ ok: false, status: "RUN_CREATE_FAILED" }, 500);
  let processed = 0;
  try {
    const client = new TspoonlabClient(
        Deno.env.get("TSPOONLAB_REMEMBERME") ?? "",
        { timezone: "Europe/Madrid" },
      ),
      pageSize = 25;
    let pageStart = start;
    let hasMore = false;
    do {
      const headers = await client.listOrders(pageStart, pageSize);
      for (let o = 0; o < headers.length; o += 5) {
        const details = await Promise.all(
          headers.slice(o, o + 5).map((x) =>
            client.getOrder(String(x.id ?? ""))
          ),
        );
        for (const detail of details) {
          const order = mapOrder(detail, run.id),
            deliveries = mapDeliveries(detail, run.id),
            lines = deliveries.flatMap((delivery) => {
              const rawDeliveryId = delivery.external_id.slice(
                `${order.external_id}:`.length,
              );
              const source = (detail as { listComandes: unknown[] })
                .listComandes
                .find((x) =>
                  (x as Record<string, unknown>).id === rawDeliveryId
                );
              return mapOrderLines(source, run.id, order.external_id);
            });
          const { error: replaceError } = await db.rpc("replace_tspoon_order", {
            p_order: order,
            p_deliveries: deliveries,
            p_lines: lines,
          });
          if (replaceError) throw new Error("ORDER_REPLACE_FAILED");
          processed++;
        }
      }
      hasMore = headers.length === pageSize;
      pageStart += headers.length;
      if (pageStart > 500) {
        throw new TspoonlabError("Demasiados pedidos", "INVALID_RESPONSE");
      }
    } while (hasMore);
    const checkedAt = new Date().toISOString();
    const { error: connectorError } = await db.from("tspoonlab_connector_status").update({
      status: "HEALTHY",
      last_checked_at: checkedAt,
      last_success_at: checkedAt,
      last_error_code: null,
      updated_at: checkedAt,
    }).eq("singleton", true);
    if (connectorError) throw new Error("CONNECTOR_STATUS_WRITE_FAILED");
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
      hasMore: false,
    });
  } catch (error) {
    const raw = error instanceof TspoonlabError
        ? error.code
        : error instanceof Error
        ? error.message
        : "SYNC_FAILED",
      connectorCodes = [
          "AUTH_EXPIRED",
          "FORBIDDEN",
          "RATE_LIMITED",
          "UPSTREAM_ERROR",
          "NETWORK_ERROR",
          "INVALID_RESPONSE",
        ],
      code = [
          ...connectorCodes,
          "ORDER_REPLACE_FAILED",
          "CONNECTOR_STATUS_WRITE_FAILED",
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
    if (connectorCodes.includes(code)) {
      const checkedAt = new Date().toISOString();
      await db.from("tspoonlab_connector_status").update({
        status: code,
        last_checked_at: checkedAt,
        last_error_code: code,
        updated_at: checkedAt,
      }).eq("singleton", true);
    }
    return json(
      { ok: false, status: code, runId: run.id },
      code === "AUTH_EXPIRED" ? 401 : 503,
    );
  }
});
