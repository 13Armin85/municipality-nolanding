import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { beforeEach } from "node:test";
import ts from "typescript";

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const receiptModule = moduleUrl(compile(await readFile(new URL("../src/app/data/receipt.ts", import.meta.url), "utf8")));
const transport = moduleUrl("export const renovationBillApiFetch = (...args) => globalThis.__receiptFetchMock(...args);");
const source = compile(await readFile(new URL("../src/app/data/receiptInquiry.ts", import.meta.url), "utf8"))
  .replace('"./api"', JSON.stringify(transport)).replace('"./receipt"', JSON.stringify(receiptModule));
const { canRefreshReceipt, fetchReceiptDetails } = await import(moduleUrl(source));
const { readReceiptParams, getReceiptTotal } = await import(receiptModule);

const bill = {
  ParvandeNo: 12345, IdMalek: 1, Year: 1405,
  ShenaseGhabz: "0012345678901", ShenasePardakht: "0009876543210",
  CodeNosazi: "2-202-3-12-0-0-0", NameOwner: "علی رضایی", Address: "نشانی ملک",
  Description: "عوارض شهری", DateSodor: "1405/08/19",
  Price: 9700802, DelayedPrice: 881891, PaymentStatus: false,
};
const link = (overrides = {}) => readReceiptParams(new URLSearchParams({
  ...bill, Success: "true", Price: "2500000.0000", DelayedPrice: "0.0000", ...overrides,
})).receipt;
let requests;
beforeEach(() => {
  requests = [];
  globalThis.__receiptFetchMock = async (endpoint, options) => {
    requests.push({ endpoint, options });
    return Response.json([bill]);
  };
});

test("receipt fetches the existing public ReceiveBill API with code, owner and cancellation", async () => {
  const controller = new AbortController();
  const result = await fetchReceiptDetails(link(), controller.signal);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].endpoint, "/Api/PaymentAvarez/ReceiveBill?codeNosazi=2-202-3-12-0-0-0&ownerId=1");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(requests[0].options.signal, controller.signal);
  assert.equal(new Headers(requests[0].options.headers).has("Authorization"), false);
  assert.equal(result.NameOwner, bill.NameOwner);
  assert.equal(result.Address, bill.Address);
  assert.equal(getReceiptTotal(result), 10582693);
  assert.equal(result.PaymentStatus, "false");
  assert.equal(result.ShenaseGhabz, bill.ShenaseGhabz);
  assert.equal(result.ShenasePardakht, bill.ShenasePardakht);
});

test("the selected bill must match both identifiers and metadata, not its array position", async () => {
  const wrongBills = [
    { ...bill, ShenasePardakht: "999" }, { ...bill, ShenaseGhabz: "888" },
    { ...bill, Year: 1404 }, { ...bill, IdMalek: 2 },
    { ...bill, CodeNosazi: "2-202-3-13-0-0-0" }, { ...bill, ParvandeNo: 456 },
  ];
  globalThis.__receiptFetchMock = async () => Response.json([...wrongBills, bill]);
  assert.equal((await fetchReceiptDetails(link())).Price, bill.Price);
  for (const wrong of wrongBills) {
    globalThis.__receiptFetchMock = async () => Response.json([wrong]);
    await assert.rejects(fetchReceiptDetails(link()), /مطابقت ندارد/);
  }
});

test("nested envelopes and camelCase aliases preserve false and zero values", async () => {
  const record = Object.fromEntries(Object.entries(bill).map(([key, value]) => [key[0].toLowerCase() + key.slice(1), value]));
  Object.assign(record, { price: 0, delayedPrice: 0, paymentStatus: false });
  globalThis.__receiptFetchMock = async () => Response.json({ IsSuccess: true, Value: { data: { Items: [record] } } });
  const result = await fetchReceiptDetails(link({ PaymentStatus: "true" }));
  assert.equal(result.Price, 0);
  assert.equal(result.DelayedPrice, 0);
  assert.equal(result.PaymentStatus, "false");
});

test("known API aliases and string decimal amounts are normalized without dropping owner fields", async () => {
  globalThis.__receiptFetchMock = async () => Response.json({ value: [{
    file_no: 12345, owner_id: 1, sal: 1405, billId: bill.ShenaseGhabz, paymentId: bill.ShenasePardakht,
    fullCode: bill.CodeNosazi, ownerName: "نام دریافتی", nam_address: "نشانی دریافتی",
    amount: "9700802.0000", moavaghe: "881891.0000", isPaid: true,
  }] });
  const result = await fetchReceiptDetails(link());
  assert.equal(result.NameOwner, "نام دریافتی");
  assert.equal(result.Address, "نشانی دریافتی");
  assert.equal(result.PaymentStatus, "true");
  assert.equal(getReceiptTotal(result), 10582693);
});

test("API omissions retain known link details but never invent missing owner or address data", async () => {
  globalThis.__receiptFetchMock = async () => Response.json([{ ...bill, NameOwner: null, Address: null }]);
  const retained = await fetchReceiptDetails(link());
  assert.equal(retained.NameOwner, bill.NameOwner);
  assert.equal(retained.Address, bill.Address);
  const missing = await fetchReceiptDetails(link({ NameOwner: "", Address: "" }));
  assert.equal(missing.NameOwner, "");
  assert.equal(missing.Address, "");
});

test("an invalid API amount does not silently fall back to the old link amount", async () => {
  for (const value of ["invalid", -1, 1.5, 9007199254740992]) {
    globalThis.__receiptFetchMock = async () => Response.json([{ ...bill, Price: value }]);
    assert.equal((await fetchReceiptDetails(link())).Price, null);
  }
});

test("empty, ambiguous and failed responses cannot be selected as a fresh receipt", async () => {
  for (const payload of [[], [bill, bill], { isSuccess: false, value: [bill] }, { IsFailure: true, Value: [bill] }]) {
    globalThis.__receiptFetchMock = async () => Response.json(payload);
    await assert.rejects(fetchReceiptDetails(link()));
  }
  for (const status of [401, 404, 500]) {
    globalThis.__receiptFetchMock = async () => new Response("", { status });
    await assert.rejects(fetchReceiptDetails(link()), /دریافت اطلاعات/);
  }
});

test("missing bill identifiers in a link can be filled only from a unique matching receipt", async () => {
  const result = await fetchReceiptDetails(link({ ShenaseGhabz: "", ShenasePardakht: "" }));
  assert.equal(result.ShenaseGhabz, bill.ShenaseGhabz);
  assert.equal(result.ShenasePardakht, bill.ShenasePardakht);
  globalThis.__receiptFetchMock = async () => Response.json([bill, { ...bill, ShenasePardakht: "222" }]);
  await assert.rejects(fetchReceiptDetails(link({ ShenaseGhabz: "", ShenasePardakht: "" })), /مطابقت ندارد/);
});

test("incomplete or invalid query selectors never trigger a guessed owner or bill lookup", async () => {
  for (const overrides of [{ CodeNosazi: "555" }, { CodeNosazi: "" }, { IdMalek: "" }, { IdMalek: "0" }, { IdMalek: "invalid" }]) {
    assert.equal(canRefreshReceipt(link(overrides)), false);
    await assert.rejects(fetchReceiptDetails(link(overrides)), /کد نوسازی/);
  }
  assert.equal(requests.length, 0);
});

test("localized request digits are normalized while receipt identifiers keep leading zeros", async () => {
  assert.equal((await fetchReceiptDetails(link({ CodeNosazi: "۲-۲۰۲-۳-۱۲-۰-۰-۰", IdMalek: "۱" }))).CodeNosazi, bill.CodeNosazi);
  assert.match(requests[0].endpoint, /codeNosazi=2-202-3-12-0-0-0&ownerId=1$/);
});

test("aborted requests propagate cancellation without returning stale data", async () => {
  globalThis.__receiptFetchMock = async () => { throw new DOMException("Cancelled", "AbortError"); };
  await assert.rejects(fetchReceiptDetails(link()), { name: "AbortError" });
});
