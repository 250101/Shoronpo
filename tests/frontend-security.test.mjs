import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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
  ]) assert.ok(html.includes(expression), `Falta protección: ${expression}`);
});

test("el script principal conserva sintaxis JavaScript válida", () => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((source) => source.trim());
  assert.ok(scripts.length > 0);
  for (const source of scripts) new Function(source);
});
