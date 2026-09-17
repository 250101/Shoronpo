import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
const adminUsers = readFileSync(new URL("../supabase/functions/admin-users/index.ts", import.meta.url), "utf8");
const supabaseConfig = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

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
  assert.match(script, /auth\.mfa\.enroll\(\{/);
  assert.match(script, /friendlyName:`Shoronpo admin \$\{Date\.now\(\)\}`/);
  assert.match(script, /auth\.mfa\.challengeAndVerify\(/);
  assert.match(script, /if\(!\(await requireAdminMfa\(access\)\)\) return false/);
});

test("las consultas de autorización reintentan fallos transitorios", () => {
  assert.match(script, /AUTHORIZATION_RETRY_DELAYS_MS=\[0,350,900\]/);
  assert.match(script, /isTransientAuthorizationError\(lastError\)/);
  assert.match(script, /authorizationQuery\('profile'/);
  assert.match(script, /authorizationQuery\('roles'/);
  assert.match(script, /authorizationQuery\('locations'/);
});

test("un fallo transitorio de permisos conserva la sesión para poder reintentar", () => {
  const guardedSignOuts=script.match(/if\(error\?\.name!=='AuthorizationLoadError'\) await supabaseClient\.auth\.signOut\(\)\.catch\(\(\)=>\{\}\);/g)||[];
  assert.equal(guardedSignOuts.length,2);
  assert.match(script, /roles!inner\(code\)/);
});

test("la función administrativa responde al preflight sin cuerpo y admite todos los roles", () => {
  assert.match(adminUsers, /status === 204/);
  assert.match(adminUsers, /new Response\(null/);
  for (const role of ["ADMINISTRADOR", "DIRECCION", "OBRADOR", "RESTAURANTE"]) {
    assert.ok(adminUsers.includes(`"${role}"`), `Falta el rol ${role}`);
  }
});

test("la administración de usuarios sólo se muestra a administradores e invoca el backend", () => {
  assert.match(html, /id="adminUsersCard" hidden/);
  assert.match(html, /id="adminUserForm"/);
  assert.match(script, /adminUsersCard'\)\.hidden=!hasRole\('ADMINISTRADOR'\)/);
  assert.match(script, /functions\.invoke\('admin-users'/);
  assert.match(script, /assurance\.currentLevel!=='aal2'/);
  assert.match(script, /Authorization:`Bearer \$\{sessionData\.session\.access_token\}`/);
  assert.match(script, /typeof error\?\.context\?\.json==='function'/);
  assert.match(script, /EMAIL_RATE_LIMIT/);
  assert.match(adminUsers, /inviteCode\.includes\("rate_limit"\)/);
  assert.match(supabaseConfig, /\[functions\.admin-users\]\s+verify_jwt = false/);
  assert.match(adminUsers, /userClient\.auth\s*\.getClaims\(token\)/);
  assert.match(adminUsers, /userClient\.rpc\(\s*"is_admin_aal2"/);
});
