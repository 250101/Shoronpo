import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/generate-runtime-config.mjs", import.meta.url));
const devRef = "htuearldqvzqohoxwmdp";

function generate(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), "shoronpo-config-"));
  const output = join(dir, "runtime-config.js");
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, SHORONPO_CONFIG_OUTPUT: output, ...extraEnv },
  });
  const content = result.status === 0 ? readFileSync(output, "utf8") : "";
  rmSync(dir, { recursive: true, force: true });
  return { ...result, content };
}

test("staging usa el proyecto de desarrollo cuando no hay variables", () => {
  const result = generate({ CONTEXT: "branch-deploy", SHORONPO_SUPABASE_URL: "", SHORONPO_SUPABASE_PUBLISHABLE_KEY: "" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.content, new RegExp(devRef));
  assert.match(result.content, /"environment":"branch-deploy"/);
});

test("producción falla cerrada si faltan variables", () => {
  const result = generate({ CONTEXT: "production", SHORONPO_SUPABASE_URL: "", SHORONPO_SUPABASE_PUBLISHABLE_KEY: "" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Producción requiere/);
});

test("producción no puede reutilizar la base de desarrollo", () => {
  const result = generate({
    CONTEXT: "production",
    SHORONPO_SUPABASE_URL: `https://${devRef}.supabase.co`,
    SHORONPO_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /producción no puede apuntar/);
});

test("producción acepta un proyecto separado", () => {
  const result = generate({
    CONTEXT: "production",
    SHORONPO_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    SHORONPO_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_production_test",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.content, /abcdefghijklmnopqrst/);
  assert.doesNotMatch(result.content, new RegExp(devRef));
});
