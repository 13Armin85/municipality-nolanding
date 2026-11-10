import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import ts from "typescript";

// Exercise the service with a mocked transport; no live payment requests.
const transport = `data:text/javascript;base64,${Buffer.from(
  "export const paymentApiFetch = (...args) => globalThis.__paymentApiFetchMock(...args);",
).toString("base64")}`;
const source = await readFile(new URL("../src/app/services/paymentService.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('"../data/api"', JSON.stringify(transport)).replaceAll("import.meta.env", "({})");
const { requestPaymentToken } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

let requests;
beforeEach(() => {
  requests = [];
  globalThis.__paymentApiFetchMock = async (endpoint, options) => {
    requests.push({ endpoint, options });
    return new Response(JSON.stringify({ isSuccess: true, value: { refId: "TEST-REF", redirectUrl: "https://asan.shaparak.ir" } }));
  };
});
const identifiers = { billId: "001234567890123", paymentId: "9876543210" };

test("guest payment requests a gateway token without Authorization", async () => {
  const result = await requestPaymentToken(identifiers);
  assert.deepEqual(result, { refId: "TEST-REF", redirectUrl: "https://asan.shaparak.ir" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, "/api/payment/token");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(new Headers(requests[0].options.headers).has("Authorization"), false);
  assert.deepEqual(JSON.parse(requests[0].options.body), identifiers);
});

test("existing authenticated callers still send their bearer token", async () => {
  await requestPaymentToken(identifiers, "Bearer test-token");
  assert.equal(new Headers(requests[0].options.headers).get("Authorization"), "Bearer test-token");
});

test("empty optional tokens are omitted rather than sent as an empty bearer", async () => {
  await requestPaymentToken(identifiers, "Bearer ");
  assert.equal(new Headers(requests[0].options.headers).has("Authorization"), false);
});

test("invalid bill identifiers are rejected before a guest network request", async () => {
  await assert.rejects(requestPaymentToken({ billId: "invalid", paymentId: "12345" }), /شناسه قبض/);
  assert.equal(requests.length, 0);
});

test("backend authentication requirements are reported without telling guests to log in", async () => {
  for (const status of [401, 403]) {
    globalThis.__paymentApiFetchMock = async () => new Response("", { status });
    await assert.rejects(requestPaymentToken(identifiers), /امکان پرداخت بدون ورود را فراهم نکرده/);
  }
});
