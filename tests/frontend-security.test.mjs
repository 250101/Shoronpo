import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]);
}

function actionValue(value) {
  return encodeURIComponent(String(value ?? "")).replace(/'/g, "%27");
}

test("texto externo no puede crear etiquetas HTML", () => {
  const attack = `<img src=x onerror="globalThis.pwned=1">'`;
  const escaped = escapeHtml(attack);
  assert.equal(escaped.includes("<img"), false);
  assert.equal(escaped.includes('onerror="'), false);
  assert.match(escaped, /&lt;img/);
});

test("identificadores de acciones no pueden cerrar la comilla", () => {
  const attack = `x');globalThis.pwned=1;//`;
  const encoded = actionValue(attack);
  assert.equal(encoded.includes("'"), false);
  assert.equal(decodeURIComponent(encoded), attack);
});

test("los campos de inventario y comentarios se renderizan escapados", () => {
  for (const expression of [
    "${escapeHtml(d.producto)}",
    "${escapeHtml(d.familia)}",
    "${escapeHtml(p.producto)}",
    "${escapeHtml(e.comentario)}",
  ]) assert.ok(script.includes(expression), `Falta protección: ${expression}`);
});

test("no quedan scripts ni eventos inline", () => {
  assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*[^<\s]/i);
  assert.doesNotMatch(html, /\son(?:click|change|input)=/i);
  assert.match(html, /<script src="app\.js" defer><\/script>/);
  new Function(script);
});

test("la CSP bloquea scripts y atributos inline", () => {
  const csp = netlify.match(/Content-Security-Policy = "([^"]+)"/)?.[1] ?? "";
  assert.ok(csp);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)?.[0] ?? "", /unsafe-inline/);
  assert.match(csp, /script-src-attr 'none'/);
});

test("el administrador debe completar MFA antes de activar la sesión", () => {
  assert.match(script, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(script, /currentLevel==='aal2'/);
  assert.match(script, /auth\.mfa\.enroll\(\{factorType:'totp'/);
  assert.match(script, /auth\.mfa\.challengeAndVerify\(/);
  assert.match(script, /if\(!\(await requireAdminMfa\(access\)\)\) return false/);
});
