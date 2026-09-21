import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const stock = read("../supabase/functions/tspoonlab-sync-stock/index.ts");
const productions = read("../supabase/functions/tspoonlab-sync-productions/index.ts");
const orders = read("../supabase/functions/tspoonlab-sync-orders/index.ts");
const telegram = read("../supabase/functions/telegram-system-alerts/index.ts");
const migration = read("../supabase/migrations/0028_operational_alert_hardening.sql");
const frontend = read("../app.js");

test("todos los bloques reflejan fallos del conector y recuperación", () => {
  for (const source of [stock, productions, orders]) {
    assert.match(source, /tspoonlab_connector_status/);
    assert.match(source, /AUTH_EXPIRED/);
    assert.match(source, /last_error_code/);
  }
  for (const source of [productions, orders]) {
    assert.match(source, /status:\s*['"]HEALTHY['"]/);
    assert.match(source, /CONNECTOR_STATUS_WRITE_FAILED/);
  }
});

test("simulacros y alertas reales permanecen separados", () => {
  assert.match(migration, /scope text not null default 'LIVE'/);
  assert.match(migration, /scope in \('LIVE','DRILL'\)/);
  assert.match(migration, /system_alerts_one_open_per_scope_type_block/);
  assert.match(frontend, /\.eq\('scope','LIVE'\)/);
  assert.match(telegram, /\.eq\('scope','LIVE'\)/);
});

test("AUTH_EXPIRED no se degrada a un fallo genérico", () => {
  assert.match(migration, /v_run\.error_code='AUTH_EXPIRED'/);
  assert.match(migration, /v_auth_expired := true/);
  assert.match(migration, /alert_type='SYNC_FAILED'/);
  assert.match(migration, /values \('LIVE','AUTH_EXPIRED','CRITICAL'/);
});

test("Telegram reclama cada entrega y libera el reclamo ante fallo", () => {
  assert.match(telegram, /telegram_claim_token:claimToken/);
  assert.match(telegram, /telegram_claimed_at\.is\.null/);
  assert.match(telegram, /telegram_claim_token',claimToken/);
  assert.match(telegram, /telegram_claim_token:null,telegram_claimed_at:null/);
  assert.match(telegram, /SHORONPO_ENVIRONMENT/);
});
