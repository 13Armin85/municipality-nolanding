import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Evaluate configuration without starting Vite or loading build plugins.
const configuration = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const evaluateConfig = async (source, env = {}) => {
  globalThis.__apiTestEnv = env;
  const compiled = compile(source)
    .replace(/import \{ defineConfig, loadEnv \} from "vite";/, 'const defineConfig = value => value; const loadEnv = () => globalThis.__apiTestEnv; const __dirname = "C:/config-test";')
    .replace(/import react from "@vitejs\/plugin-react";/, "const react = () => ({});")
    .replace(/import tailwindcss from "@tailwindcss\/vite";/, "const tailwindcss = () => ({});")
    .replace(/import \{ VitePWA \} from "vite-plugin-pwa";/, "const VitePWA = () => ({});");
  const module = await import(moduleUrl(compiled));
  return module.default({ mode: "test" });
};

test("changing the five Vite defaults changes both browser URLs and matching proxy targets", async () => {
  const families = [
    ["API", "/api", "http://127.0.0.1:6102/old"],
    ["DOTNET10_API", "/dotnet10-api", "http://127.0.0.1:6101/core"],
    ["PAYMENT_API", "/payment-api", "http://127.0.0.1:6103/pay"],
    ["RENOVATION_BILL_API", "/renovation-bill-api", "http://127.0.0.1:6104/bill"],
    ["SMS_API", "/sms-api", "http://127.0.0.1:6105/sms"],
  ];
  let source = configuration;
  for (const [family, , host] of families) {
    source = source.replace(new RegExp(`^const DEFAULT_${family}_BASE_URL =\\s*"[^"]*";`, "m"), `const DEFAULT_${family}_BASE_URL = "${host}";`);
  }
  const config = await evaluateConfig(source);
  for (const [family, proxy, host] of families) {
    assert.equal(JSON.parse(config.define[`import.meta.env.VITE_${family}_BASE_URL`]), host);
    assert.equal(config.server.proxy[proxy].target, host);
  }
});

test("environment overrides and legacy aliases are respected; proxy-only overrides stay local", async () => {
  const config = await evaluateConfig(configuration, {
    VITE_DOTNET10_API_URL: "http://localhost:7000/core/",
    VITE_DOTNET10_API_PROXY_TARGET: "http://localhost:8000/proxy/",
    VITE_API_BASE_URL: "http://localhost:9000/old/",
  });
  assert.equal(JSON.parse(config.define["import.meta.env.VITE_DOTNET10_API_BASE_URL"]), "http://localhost:7000/core");
  assert.equal(config.server.proxy["/dotnet10-api"].target, "http://localhost:8000/proxy");
  assert.equal(JSON.parse(config.define["import.meta.env.VITE_API_BASE_URL"]), "http://localhost:9000/old");
});

test("client API transports use supplied base addresses without hardcoded fallback domains", async () => {
  const storage = moduleUrl('export const AUTH_TOKEN_KEY="token",REFRESH_TOKEN_KEY="refresh";export const expireStoredAuthSession=()=>{};export const storeAuthTokens=()=>{};');
  const env = Object.fromEntries(["API", "DOTNET10_API", "PAYMENT_API", "RENOVATION_BILL_API", "SMS_API"].map((name, index) => [`VITE_${name}_BASE_URL`, `http://127.0.0.1:${7100 + index}/service///`]));
  const source = compile(await readFile(new URL("../src/app/data/api.ts", import.meta.url), "utf8"))
    .replace('"../utils/authStorage"', JSON.stringify(storage)).replaceAll("import.meta.env", JSON.stringify(env));
  const api = await import(moduleUrl(source));
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => { requests.push(url); return Response.json({}); };
  try {
    await api.apiFetch("/api/test");
    await api.dotNet10ApiFetch("/api/admin/certificates");
    await api.paymentApiFetch("/api/test");
    await api.renovationBillApiFetch("/api/test");
    await api.smsApiFetch("/api/test");
    assert.deepEqual(requests, [
      "http://127.0.0.1:7100/service/api/test", "http://127.0.0.1:7101/service/api/admin/certificates",
      "http://127.0.0.1:7102/service/api/test", "http://127.0.0.1:7103/service/api/test", "http://127.0.0.1:7104/service/api/test",
    ]);
  } finally { globalThis.fetch = originalFetch; }
});
