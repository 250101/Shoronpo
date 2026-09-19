import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV_PROJECT_REF = "htuearldqvzqohoxwmdp";
const DEV_URL = `https://${DEV_PROJECT_REF}.supabase.co`;
const DEV_KEY = "sb_publishable_KZKbJob8_QwdWs3VUPVKgw_6IVK0LQV";
const context = process.env.CONTEXT || "local";
const production = context === "production";
const supabaseUrl = process.env.SHORONPO_SUPABASE_URL || (production ? "" : DEV_URL);
const supabasePublishableKey = process.env.SHORONPO_SUPABASE_PUBLISHABLE_KEY || (production ? "" : DEV_KEY);

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Producción requiere SHORONPO_SUPABASE_URL y SHORONPO_SUPABASE_PUBLISHABLE_KEY.");
}

const parsedUrl = new URL(supabaseUrl);
if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
  throw new Error("SHORONPO_SUPABASE_URL no es una URL válida de Supabase.");
}

const projectRef = parsedUrl.hostname.split(".")[0];
if (production && projectRef === DEV_PROJECT_REF) {
  throw new Error("Despliegue bloqueado: producción no puede apuntar al proyecto Supabase de desarrollo.");
}

const output = resolve(process.env.SHORONPO_CONFIG_OUTPUT || "runtime-config.js");
const config = {
  environment: context,
  supabaseUrl: parsedUrl.origin,
  supabasePublishableKey,
};
writeFileSync(output, `globalThis.SHORONPO_CONFIG=Object.freeze(${JSON.stringify(config)});\n`, "utf8");
console.log(`Runtime config generado para ${context} (${projectRef}).`);
