import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const transport = moduleUrl("export const dotNet10ApiFetch = (...args) => globalThis.__certificatesFetch(...args);");
const storage = moduleUrl('export const AUTH_TOKEN_KEY = "auth-token";');
const source = ts.transpileModule(await readFile(new URL("../src/app/data/certificates.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('"./api"', JSON.stringify(transport)).replace('"../utils/authStorage"', JSON.stringify(storage));
const { fetchCertificates, readCertificates, certificatePdfBlob, certificateFileName } = await import(moduleUrl(source));

const pdf = Buffer.from("%PDF-1.7\nTest certificate PDF\n%%EOF").toString("base64");
const record = { fileId: 242808, requestId: 18205, dateOfIssue: "1405/08/23 08:48:29", type: "پروانه ساختمان", pdf };
let requests;
beforeEach(() => {
  requests = [];
  globalThis.localStorage = { getItem: () => "Bearer TEST-TOKEN" };
  globalThis.__certificatesFetch = async (...args) => {
    requests.push(args);
    return Response.json({ value: [record], isSuccess: true, isFailure: false });
  };
});

test("fetches the relative core API endpoint with bearer token, no-store and cancellation", async () => {
  const controller = new AbortController();
  const records = await fetchCertificates(controller.signal);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], "/api/admin/certificates");
  const options = requests[0][1];
  assert.equal(options.method, "GET");
  assert.equal(options.headers.Authorization, "Bearer TEST-TOKEN");
  assert.equal(options.cache, "no-store");
  assert.equal(options.signal, controller.signal);
  assert.equal(records[0].pdf, pdf);
});

test("all records and all response fields are retained with unique UI keys", () => {
  const records = readCertificates({ value: Array.from({ length: 9 }, () => record), isSuccess: true });
  assert.equal(records.length, 9);
  assert.equal(new Set(records.map(item => item.id)).size, 9);
  assert.deepEqual({ ...records[0], id: undefined }, { ...record, fileId: "242808", requestId: "18205", id: undefined });
});

test("PascalCase, string identifiers, missing fields and empty lists are supported", () => {
  const [item] = readCertificates({ Value: [{ FileId: "00001", RequestId: "00002", Type: "پایانکار", Pdf: pdf }] });
  assert.equal(item.fileId, "00001");
  assert.equal(item.requestId, "00002");
  assert.equal(item.pdf, pdf);
  assert.equal(item.dateOfIssue, "");
  assert.deepEqual(readCertificates({ value: [] }), []);
});

test("failure envelopes and malformed payloads are not shown as empty success", () => {
  for (const payload of [null, "invalid", {}, { value: null }, { value: [null] }, { value: [42] }]) {
    assert.throws(() => readCertificates(payload), /معتبر نیست/);
  }
  assert.throws(() => readCertificates({ isSuccess: false, value: [], error: { name: "خطای سرویس" } }), /خطای سرویس/);
  assert.throws(() => readCertificates({ IsFailure: true, Value: [record] }), /انجام نشد/);
});

test("HTTP errors and aborted requests propagate instead of displaying stale records", async () => {
  globalThis.__certificatesFetch = async () => new Response("", { status: 403 });
  await assert.rejects(fetchCertificates(), /اجازه مشاهده/);
  globalThis.__certificatesFetch = async () => new Response("", { status: 500 });
  await assert.rejects(fetchCertificates(), /دریافت گواهی/);
  globalThis.__certificatesFetch = async () => { throw new DOMException("Cancelled", "AbortError"); };
  await assert.rejects(fetchCertificates(), { name: "AbortError" });
});

test("PDF download bytes are preserved for plain base64, data URIs and whitespace", async () => {
  for (const value of [pdf, `data:application/pdf;base64,${pdf}`, pdf.replace(/.{10}/g, "$&\n")]) {
    const blob = certificatePdfBlob(value);
    assert.equal(blob.type, "application/pdf");
    assert.equal(await blob.text(), "%PDF-1.7\nTest certificate PDF\n%%EOF");
  }
});

test("invalid files and remote or executable URLs cannot be opened as PDF", () => {
  for (const value of ["", "%%%", "https://example.com/file.pdf", "javascript:alert(1)", Buffer.from("<html>invalid</html>").toString("base64")]) {
    assert.throws(() => certificatePdfBlob(value), /معتبر نیست|نوع PDF نیست/);
  }
  assert.equal(certificateFileName({ type: "گواهی/ساختمان", fileId: "123" }), "گواهی-ساختمان-123.pdf");
});
