import assert from "node:assert/strict";
import test from "node:test";
import { TspoonlabClient, TspoonlabError } from "../supabase/functions/_shared/tspoonlab-client.ts";

async function expectCode(action, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof TspoonlabError);
    assert.equal(error.code, code);
    return true;
  });
}

test("una credencial ausente se clasifica como sesión expirada", () => {
  assert.throws(() => new TspoonlabClient(""), (error) => {
    assert.ok(error instanceof TspoonlabError);
    assert.equal(error.code, "AUTH_EXPIRED");
    return true;
  });
});

test("401 y 403 se clasifican sin reintentos", async () => {
  for (const [status, code] of [[401, "AUTH_EXPIRED"], [403, "FORBIDDEN"]]) {
    let calls = 0;
    const client = new TspoonlabClient("test", { fetchImpl: async () => {
      calls += 1;
      return new Response("{}", { status });
    }});
    await expectCode(() => client.get("test"), code);
    assert.equal(calls, 1);
  }
});

test("429 y 5xx reintentan con límite y conservan su clasificación", async () => {
  for (const [status, code] of [[429, "RATE_LIMITED"], [503, "UPSTREAM_ERROR"]]) {
    let calls = 0;
    const client = new TspoonlabClient("test", {
      maxRetries: 2,
      baseDelayMs: 1,
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status });
      },
    });
    await expectCode(() => client.get("test"), code);
    assert.equal(calls, 3);
  }
});

test("fallos de red reintentan y terminan como NETWORK_ERROR", async () => {
  let calls = 0;
  const client = new TspoonlabClient("test", {
    maxRetries: 2,
    baseDelayMs: 1,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("socket secreto");
    },
  });
  await expectCode(() => client.get("test"), "NETWORK_ERROR");
  assert.equal(calls, 3);
});

test("una respuesta 200 inválida se rechaza sin aceptar datos corruptos", async () => {
  const client = new TspoonlabClient("test", {
    fetchImpl: async () => new Response("no-json", { status: 200 }),
  });
  await expectCode(() => client.get("test"), "INVALID_RESPONSE");
});

test("la petición correcta usa zona horaria de Madrid y no expone el token", async () => {
  let observedHeaders;
  const client = new TspoonlabClient("secret-test-token", {
    fetchImpl: async (_url, init) => {
      observedHeaders = new Headers(init?.headers);
      return new Response('{"ok":true}', { status: 200 });
    },
  });
  assert.deepEqual(await client.get("test"), { ok: true });
  assert.equal(observedHeaders.get("timezone"), "Europe/Madrid");
  assert.equal(JSON.stringify(client).includes("secret-test-token"), false);
});
